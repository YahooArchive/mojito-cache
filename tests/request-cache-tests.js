/*jslint nomen: true, indent: 4, plusplus: true, stupid: true */
/*global YUI, YUITest */

YUI.add('request-cache-tests', function (Y, NAME) {
    'use strict';

    var A = YUITest.Assert,
        Value = YUITest.Mock.Value,
        suite = new YUITest.TestSuite(NAME);

    // Y.use('mojito-pipeline-addon');

    suite.add(new YUITest.TestCase({

        name: 'unit tests',

        'Test user rules (JS)': function () {
            A.pass();
        }
    }));

    YUITest.TestRunner.add(suite);
}, '0.0.1', {
    requires: [ 'request-cache' ]
});
