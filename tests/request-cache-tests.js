/*jslint nomen: true, indent: 4 */
/*global YUI, YUITest */

YUI.add('request-cache-tests', function (Y, NAME) {
    'use strict';

    var A = YUITest.Assert,
        suite = new YUITest.TestSuite(NAME),

        BazAddon = function () {
            this.cached = false;
            this.namespace = 'baz';
        },

        QuuxAddon = function () {
            this.cached = false;
            this.namespace = 'quux';
        };

    suite.add(new YUITest.TestCase({
        name: 'unit tests',

        setUp: function () {
            var self = this;

            this.CONFIG = {
                'request-cache': {
                    refreshAddons: [ 'baz' ]
                }
            };

            this.baseCacheUsed = false;
            this.typeCacheUsed = false;
            this.__callIsUsed = false;

            this.cachedAc = {
                command: {
                    instance: {
                        config: {}
                    }
                },
                baz: new BazAddon({ cached: true }),
                quux: new QuuxAddon({ cached: true })
            };

            // mark those two cached to notice when they're reallocated
            this.cachedAc.baz.cached = true;
            this.cachedAc.quux.cached = true;

            this.cache = {
                byBase: {
                    'foo': [{
                        actionContext: this.cachedAc,
                        controller: {
                            index: function () {
                                self.baseCacheUsed = true;
                            },
                            __call: function () {
                                self.__callIsUsed = true;
                            }
                        }
                    }]
                },
                byType: {
                    'Bar': [{
                        actionContext: this.cachedAc,
                        controller: {
                            index: function () {
                                self.typeCacheUsed = true;
                            }
                        }
                    }]
                }
            };

            Y.mojito.addons.ac = {
                baz: BazAddon,
                quux: QuuxAddon
            };
        },

        'Calling ac.done() or ac.error() should populate the cache correctly': function () {
            var req = {},

                opts = {
                    command: {
                        instance: {
                            base: 'foo'
                        }
                    },
                    adapter: {
                        req: req,
                        page: {
                            staticAppConfig: this.CONFIG
                        }
                    }
                },

                ac;

            Y.mojito.ActionContext = function (opts) {
                this._adapter = opts.adapter;
                this.instance = opts.command.instance;
            };

            Y.mojito.ActionContext.prototype = {
                done: function () {},
                error: function () {}
            };

            Y.use('request-cache');

            ac = new Y.mojito.ActionContext(opts);
            ac.done();

            A.areSame(1, req.globals['request-cache'].byBase.foo.length);
            A.isUndefined(req.globals['request-cache'].byType.bar);

            delete req.globals;
            delete opts.command.instance.base;
            opts.command.instance.type = 'bar';

            ac = new Y.mojito.ActionContext(opts);
            ac.done();

            A.isUndefined(req.globals['request-cache'].byBase.foo);
            A.areSame(1, req.globals['request-cache'].byType.bar.length);

            // Now, try ac.error()
            delete req.globals;
            ac = new Y.mojito.ActionContext(opts);
            ac.error();

            A.isUndefined(req.globals['request-cache'].byBase.foo);
            A.areSame(1, req.globals['request-cache'].byType.bar.length);
        },

        'Dispatching with no cached version calls old dispatch': function () {
            var req = {},

                command = {
                    instance: {}
                },

                adapter = {
                    req: req,
                    page: {
                        staticAppConfig: this.CONFIG
                    }
                },

                originalDispatcherCalled = false;

            Y.mojito.Dispatcher.dispatch = function () {
                originalDispatcherCalled = true;
            };

            // Invalidate the attached module to be able to use it again.
            Y.Env._attached['request-cache'] = false;

            // This will override the "original" dispatcher
            Y.use('request-cache');

            Y.mojito.Dispatcher.dispatch(command, adapter);

            // The original method is called
            A.isTrue(originalDispatcherCalled);

            // And the cache is created
            A.isObject(req.globals['request-cache'].byBase);
            A.isObject(req.globals['request-cache'].byType);
        },

        'Both Base and type: Base overrides Type': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    base: 'foo',
                    type: 'Bar',
                    action: 'index'
                }
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                },
                page: {
                    staticAppConfig: this.CONFIG
                }
            });

            // If we have only base, use base
            A.isTrue(this.baseCacheUsed);
            A.isFalse(this.typeCacheUsed);
        },

        'Only Base, Base is used': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    base: 'foo',
                    action: 'index'
                }
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                },
                page: {
                    staticAppConfig: this.CONFIG
                }
            });

            // If we have only base, use base
            A.isTrue(this.baseCacheUsed);
            A.isFalse(this.typeCacheUsed);
        },

        'Only Type, Type is used': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    type: 'Bar',
                    action: 'index'
                }
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                },
                page: {
                    staticAppConfig: this.CONFIG
                }
            });

            // If we have only base, use base
            A.isFalse(this.baseCacheUsed);
            A.isTrue(this.typeCacheUsed);
        },

        'Unknown action, __call is called': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    base: 'foo',
                    action: 'unkownAction'
                }
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                },
                page: {
                    staticAppConfig: this.CONFIG
                }
            });

            A.isTrue(this.__callIsUsed);
        },

        'Unknown action, and no __call, error is thrown': function () {

            try {
                Y.mojito.Dispatcher.dispatch({
                    instance: {
                        type: 'Bar',
                        action: 'unkownAction'
                    }
                }, {
                    req: {
                        globals: {
                            'request-cache': this.cache
                        }
                    },
                    page: {
                        staticAppConfig: this.CONFIG
                    }
                });
            } catch (e) {
                A.pass();
                return;
            }

            A.fail('An error should have been thrown earlier');
        },

        'Correct Addons are refreshed': function () {

            this.cache.byType.Bar[0].controller.index = function (ac) {
                // Verify that only baz has been refreshed in the cache
                A.isFalse(ac.baz.cached);
                A.isTrue(ac.quux.cached);
            };

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    type: 'Bar',
                    action: 'index'
                }
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                },
                page: {
                    staticAppConfig: this.CONFIG
                }
            });
        }

    }));

    YUITest.TestRunner.add(suite);

}, '0.0.1', {
    requires: [
        'mojito-dispatcher',
        'mojito-action-context'
    ]
});
