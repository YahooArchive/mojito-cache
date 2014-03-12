/*
 * Copyright (c) 2011-2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */

/*jslint node: true, nomen: true, indent: 4, plusplus: true */
/*global YUI, YUITest */

YUI.add('request-cache', function (Y, NAME) {
    'use strict';

    var staticAppConfig,
        refreshAddons,
        enabled = true,
        originalDispatchFn = Y.mojito.Dispatcher.dispatch;

    //-- ExpandedResource -----------------------------------------------------

    function ExpandedResource(options) {
        this.actionContext = options.actionContext;
        this.controller = options.controller;
    }

    //-- RequestCacheActionContext --------------------------------------------

    function RequestCacheActionContext(options) {
        this.controller = options.controller;
        RequestCacheActionContext.superclass.constructor.call(this, options);
    }

    Y.extend(RequestCacheActionContext, Y.mojito.ActionContext, {

        // This function is invoked from ac.done() and ac.error() (see below)
        // and releases (i.e. puts back into the list of available resources)
        // the resources (controller, action context) it was using. This is the
        // reverse operation that was done in our custom dispatcher function.
        _releaseCachedResources: function () {

            if (!enabled) {
                return;
            }

            var cache,
                cacheKey,
                availableResourceList,
                req = this._adapter.req,
                instance = this.instance,
                controller = this.controller,
                resource = new ExpandedResource({
                    actionContext: this,
                    controller: controller
                });

            if (!req.globals) {
                req.globals = {};
            }

            if (!req.globals['request-cache']) {
                req.globals['request-cache'] = {
                    byBase: {},
                    byType: {}
                };
            }

            cache = req.globals['request-cache'];

            if (instance.base && !cache.byBase[instance.base]) {
                cache.byBase[instance.base] = [];
            } else if (instance.type && !cache.byType[instance.type]) {
                cache.byType[instance.type] = [];
            }

            if (instance.base) {
                availableResourceList = cache.byBase[instance.base];
                cacheKey = 'base=' + instance.base;
            } else if (instance.type) {
                availableResourceList = cache.byType[instance.type];
                cacheKey = 'type=' + instance.type;
            }

            Y.log('Releasing instance for mojit [' + cacheKey + ']', 'debug', NAME);

            availableResourceList.push(resource);
        },

        done: function () {
            RequestCacheActionContext.superclass.done.apply(this, arguments);
            this._releaseCachedResources();
        },

        error: function () {
            RequestCacheActionContext.superclass.error.apply(this, arguments);
            this._releaseCachedResources();
        }
    });

    Y.mojito.ActionContext = RequestCacheActionContext;

    //-- Y.mojito.Dispatcher.dispatch -----------------------------------------

    Y.mojito.Dispatcher.dispatch = function (command, adapter) {

        var config,
            cache,
            availableResourceList,
            availableResource,
            newCommand,
            action,
            error,
            addonInstance,
            AddonConstuctor,
            freshInstance = command.instance,
            i;

        if (!staticAppConfig) {

            // Retrieve the cache configuration on the first dispatch.

            staticAppConfig = adapter.page.staticAppConfig;
            config = staticAppConfig['request-cache'] || {};

            // The cache is enabled if you don't set the "enabled" property in
            // the cache configuration, or if you set that property to a value
            // that evaluates to "true".
            if (config.hasOwnProperty('enabled')) {
                enabled = !!config.enabled;
            }

            refreshAddons = config.refreshAddons || [];
        }

        if (enabled) {

            // Build the cache if it doesn't exist...

            if (!adapter.req.globals) {
                adapter.req.globals = {};
            }

            if (!adapter.req.globals['request-cache']) {
                adapter.req.globals['request-cache'] = {
                    byBase: {},
                    byType: {}
                };
            }

            cache = adapter.req.globals['request-cache'];

            // See if there is an available cached resource that matches our instance.
            availableResourceList = (freshInstance.base && cache.byBase[freshInstance.base]) ||
                (freshInstance.type && cache.byType[freshInstance.type]);

            if (availableResourceList && availableResourceList.length > 0) {
                // Use the available cached resource by removing it from the
                // list of available resources. This guarantees that mojits
                // which controller may execute asynchronously do not share
                // the same resources!
                availableResource = availableResourceList.pop();
            }
        } else {

            Y.log('mojito-cache is disabled', 'debug', NAME);
        }

        // If there is a cached resource, dispatch with that.
        if (availableResource) {

            Y.log('Using cached instance for mojit [' +
                    ((freshInstance.base && cache.byBase[freshInstance.base]) ? 'base=' + freshInstance.base :
                        (freshInstance.type && cache.byType[freshInstance.type]) ? 'type=' + freshInstance.type : 'N/A') +
                    ']', 'debug', NAME);

            // We reference this here just to easily refer
            // to availableResource.actionContext.command
            newCommand = availableResource.actionContext.command;

            // We want the new params and action
            newCommand.params = command.params;
            newCommand.action = command.instance.action || newCommand.action;

            // This is specific to mojito-pipeline
            newCommand.task = command.task;

            // Reap anything else that might have gone into the instance config.
            Y.mix(newCommand.instance.config, command.instance.config, true);

            // Instantiate again the addons that need to be refreshed if any
            for (i = 0; i < refreshAddons.length; i++) {
                AddonConstuctor = Y.mojito.addons.ac[refreshAddons[i]];
                if (AddonConstuctor) {
                    addonInstance = new AddonConstuctor(newCommand, adapter, availableResource.actionContext);
                    if (addonInstance.namespace && availableResource.actionContext[addonInstance.namespace]) {
                        availableResource.actionContext[addonInstance.namespace] = addonInstance;
                    }
                }
            }

            // The adapter and its callbacks need to be refreshed
            availableResource.actionContext._adapter = adapter;

            // Handle the __call case
            if (Y.Lang.isFunction(availableResource.controller[newCommand.action])) {
                action = newCommand.action;
            } else if (Y.Lang.isFunction(availableResource.controller.__call)) {
                action = '__call';
            } else {
                error = new Error('No method "' + newCommand.action + '" on controller type "' + newCommand.instance.type + '"');
                error.code = 404;
                throw error;
            }

            // Handle controller timeout
            if (staticAppConfig.actionTimeout) {

                // This will be cleared in ActionContext.done if it happens in time
                availableResource.actionContext._timer = setTimeout(function () {
                    var err,
                        msg = 'Killing potential zombie context for Mojit type: ' +
                            command.instance.type +
                            ', controller: ' + availableResource.controller +
                            ', action: ' + action;

                    // Clear the timer reference so our invocation of error()
                    // doesn't try to clear it.
                    availableResource.actionContext._timer = null;

                    // Create an HTTP Timeout error with controller/action info.
                    err = new Error(msg);
                    err.code = 408;

                    availableResource.actionContext.error(err);

                }, staticAppConfig.actionTimeout);
            }

            availableResource.controller[action](availableResource.actionContext);

        } else {
            Y.log('Creating a new instance for mojit [' +
                    (freshInstance.base ? 'base=' + freshInstance.base :
                        freshInstance.type ? 'type=' + freshInstance.type : 'N/A') +
                    ']', 'debug', NAME);

            // No cache, expand the command.instance and create a new AC
            // with our custom RequestCacheActionContext constructor
            // which then instanciates all the addons and calls the controller
            // This is normal mojito workflow, except our custom constructor
            // populates the cache so next time we can find it and avoid
            // doing this.
            originalDispatchFn.apply(this, arguments);
        }
    };

}, '0.1.0', {
    requires: [
        'oop',
        'mojito-dispatcher',
        'mojito-action-context'
    ]
});
