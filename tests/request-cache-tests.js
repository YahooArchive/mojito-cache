/*jslint nomen: true, indent: 4, plusplus: true, stupid: true */
/*global YUI, YUITest */

YUI.add('request-cache-tests', function (Y, NAME) {
    'use strict';

    var A = YUITest.Assert,
        Value = YUITest.Mock.Value,
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
                    'foo': {
                        actionContext: this.cachedAc,
                        controller: {
                            index: function () {
                                self.baseCacheUsed = true;
                            }
                        }
                    }
                },
                byType: {
                    'Bar': {
                        actionContext: this.cachedAc,
                        controller: {
                            index: function () {
                                self.typeCacheUsed = true;
                            }
                        }
                    }
                }
            };

            Y.mojito.Dispatcher.store = {
                getStaticAppConfig: function () {
                    return self.CONFIG;
                }
            };
            Y.mojito.addons.ac = {
                baz: BazAddon,
                quux: QuuxAddon
            };
        },

        'Instanciating AC populates the cache correctly': function () {
            var ac,
                req = {
                    globals: {
                        "request-cache": {
                            byBase: {},
                            byType: {}
                        }
                    }
                },
                acArgs = {
                    command: {
                        instance: {
                            base: 'foo',
                            type: 'bar'
                        }
                    },
                    adapter: {
                        req: req
                    }
                };

            // create the "original" ActioContext to do nothing
            Y.mojito.ActionContext = function () {};
            Y.use('request-cache');

            ac = new Y.mojito.ActionContext(acArgs);
            // having both base and type results in being cached by base
            A.isNotUndefined(req.globals['request-cache'].byBase.foo);
            A.isUndefined(req.globals['request-cache'].byType.bar);

            delete acArgs.command.instance.base;
            ac = new Y.mojito.ActionContext(acArgs);
            // having just type populates by type
            A.isNotUndefined(req.globals['request-cache'].byType.bar);

        },

        'Dispatching with no cached version calls old dispatch': function () {
            var req = {},
                originalDispatcherCalled = false;

            // Design the "original" dispatcher so that it records if it's been called
            Y.mojito.Dispatcher.dispatch = function () {
                originalDispatcherCalled = true;
            };

            // Invalidate the attached module to be able to use it again.
            Y.Env._attached['request-cache'] = false;
            // This will override the "original" dispatcher
            Y.use('request-cache');

            Y.mojito.Dispatcher.dispatch({ instance: {} }, {
                req: req
            });

            // The original method is called
            A.isTrue(originalDispatcherCalled);
            // And the cache is created
            A.isObject(req.globals['request-cache'].byBase);
            A.isObject(req.globals['request-cache'].byType);
        },

        'Both Base and type: Base overrides Type': function () {
            var self = this;

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    base: 'foo',
                    type: 'Bar'
                },
                action: 'index'
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                }
            });

            // If we have only base, use base
            A.isTrue(this.baseCacheUsed);
            A.isFalse(this.typeCacheUsed);
        },

        'Only Base, Base is used': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    base: 'foo'
                },
                action: 'index'
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                }
            });
            // If we have only base, use base
            A.isTrue(this.baseCacheUsed);
            A.isFalse(this.typeCacheUsed);
        },

        'Only Type, Type is used': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    type: 'Bar'
                },
                action: 'index'
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                }
            });
            // If we have only base, use base
            A.isFalse(this.baseCacheUsed);
            A.isTrue(this.typeCacheUsed);
        },

        'Correct Addons are refreshed': function () {

            Y.mojito.Dispatcher.dispatch({
                instance: {
                    type: 'Bar'
                },
                action: 'index'
            }, {
                req: {
                    globals: {
                        'request-cache': this.cache
                    }
                }
            });
            // Verify that only baz has been refreshed in the cache
            A.isFalse(this.cache.byType.Bar.actionContext.baz.cached);
            A.isTrue(this.cache.byType.Bar.actionContext.quux.cached);
        }

    }));

    YUITest.TestRunner.add(suite);
}, '0.0.1', {
    requires: [
        'mojito-dispatcher',
        'mojito-action-context'
    ]
});
