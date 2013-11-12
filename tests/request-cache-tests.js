/*jslint nomen: true, indent: 4, plusplus: true, stupid: true */
/*global YUI, YUITest */

YUI.add('request-cache-tests', function (Y, NAME) {
    'use strict';

    var A = YUITest.Assert,
        Value = YUITest.Mock.Value,
        suite = new YUITest.TestSuite(NAME);

    Y.mojito.ActionContext = function () {};
    Y.use('request-cache');

    suite.add(new YUITest.TestCase({
        name: 'unit tests',

        'Instanciating AC populates the cache in the request': function () {
            var req = {
                    globals: {
                        "request-cache": {
                            byBase: {},
                            byType: {}
                        }
                    }
                },
                ac;

            ac = new Y.mojito.ActionContext({
                controller: {
                    index: function () {}
                },
                command: {
                    instance: {
                        base: 'foo'
                    }
                },
                adapter: {
                    req: req
                }
            });

            A.isTrue(!!req.globals['request-cache'].byBase.foo);
        }
    }));

    YUITest.TestRunner.add(suite);
}, '0.0.1', {
    requires: [
        'mojito-action-context'
    ]
});
