/*
 * Copyright (c) 2011-2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */
/*jslint nomen: true, indent: 4, plusplus: true*/
/*global YUI, YUITest */

YUI.add('request-cache', function (Y, NAME) {
    'use strict';

    var staticAppConfig,
        refreshedAddons,
        enabled = true,

        originalDispatcher     = Y.mojito.Dispatcher,
        OriginalActionContext  = Y.mojito.ActionContext,

        RequestCacheDispatcher = function () {

            /**
             * Here we will mimic what the ActionContext constructor does,
             * except we try to skip expanding the instance and repopulating the
             * addons if we don't have to. We build a cache in the request
             * object, which means this is useful for apps that have several
             * times the same type of mojit on the same page. The cache does not
             * survive the current request.
             * @see: ActionContext constructor
             */
            this.dispatch = function (command, adapter) {

                var config,
                    cache,
                    cachedResource,
                    newCommand,
                    action,
                    error,
                    i,
                    addonInstance,
                    AddonConstuct,
                    freshInstance = command.instance;

                if (!staticAppConfig) {

                    // Retrieve the cache configuration on the first dispatch.

                    staticAppConfig = adapter.page.staticAppConfig;
                    config = staticAppConfig['request-cache'] || {};

                    // The cache is enabled if you don't set the "enabled"
                    // property in the cache configuration, or if you set
                    // that property to a value that evaluates to "true".
                    if (config.hasOwnProperty('enabled')) {
                        enabled = !!config.enabled;
                    }

                    refreshedAddons = config.refreshAddons || [];
                }

                if (enabled) {

                    // Build the cache if it doesn't exist.
                    adapter.req.globals = adapter.req.globals || {};

                    if (!adapter.req.globals['request-cache']) {
                        adapter.req.globals['request-cache'] = {
                            byBase: {},
                            byType: {}
                        };
                    }

                    // Retrieve the cache and try to get a corresponding cached resource.
                    cache = adapter.req.globals['request-cache'];
                    cachedResource = (freshInstance.base && cache.byBase[freshInstance.base]) ||
                        (freshInstance.type && cache.byType[freshInstance.type]);
                }

                // If there is a cached resource, dispatch with that.
                if (cachedResource) {

                    // We reference this here just to easily refer
                    // to cachedResource.actionContext.command
                    newCommand = cachedResource.actionContext.command;

                    // We want the new params and action
                    newCommand.params = command.params;
                    newCommand.action = command.instance.action || newCommand.action;

                    // This is specific to mojito-pipeline
                    newCommand.task = command.task;

                    // Reap anything else that might have gone into the instance config.
                    Y.mix(newCommand.instance.config, command.instance.config, true);

                    // Instantiate again the addons that need to be refreshed if any
                    for (i = 0; i < refreshedAddons.length; i++) {
                        AddonConstuct = Y.mojito.addons.ac[refreshedAddons[i]];

                        if (AddonConstuct) {
                            addonInstance = new AddonConstuct(newCommand, adapter, cachedResource.actionContext);

                            if (addonInstance.namespace && cachedResource.actionContext[addonInstance.namespace]) {
                                cachedResource.actionContext[addonInstance.namespace] = addonInstance;
                            }
                        }
                    }

                    // The adapter and its callbacks need to be refreshed
                    cachedResource.actionContext._adapter = adapter;

                    // Handle the __call case
                    if (Y.Lang.isFunction(cachedResource.controller[newCommand.action])) {

                        action = newCommand.action;
                    } else if (Y.Lang.isFunction(cachedResource.controller.__call)) {

                        action = '__call';
                    } else {

                        error = new Error("No method '" + newCommand.action + "' on controller type '" + newCommand.instance.type + "'");
                        error.code = 404;
                        throw error;
                    }

                    // Handle controller timeout
                    if (staticAppConfig.actionTimeout) {

                        // This will be cleared in ActionContext.done if it happens in time
                        cachedResource.actionContext._timer = setTimeout(function () {
                            var err,
                                msg = 'Killing potential zombie context for Mojit type: ' +
                                    command.instance.type +
                                    ', controller: ' + cachedResource.controller +
                                    ', action: ' + action;

                            // Clear the timer reference so our invocation of error()
                            // doesn't try to clear it.
                            cachedResource.actionContext._timer = null;

                            // Create an HTTP Timeout error with controller/action info.
                            err = new Error(msg);
                            err.code = 408;

                            cachedResource.actionContext.error(err);

                            // Unlike what we do in the normal AC, this is not done because
                            // we reuse that action context!
                            // That might screw up some rendering though...
                            // cachedResource.actionContext.done = function() {
                            //     Y.log('ac.done() called after timeout. results lost', 'warn', NAME);
                            // };

                        }, staticAppConfig.actionTimeout);
                    }

                    cachedResource.controller[action](cachedResource.actionContext);

                } else {
                    // No cache, expand the command.instance and create a new AC
                    // with our custom RequestCacheActionContext constructor
                    // which then instanciates all the addons and calls the controller
                    // This is normal mojito workflow, except our custom constructor
                    // populates the cache so next time we can find it and avoid
                    // doing this.
                    originalDispatcher.dispatch.apply(this, arguments);
                }
            };
        },

        ExpandedResource = function (options) {
            this.actionContext = options.actionContext;
            this.controller    = options.controller;
        },

        /**
         * A superclass for mojito's ActionContext
         * @param {Object} options.controller
         * @param {Object} options.command
         * @param {Object} options.store
         * @param {Object} options.adapter
         * @param {Object} options.dispatcher
         */
        RequestCacheActionContext = function (options) {
            if (enabled) {
                var newExpandedResource = new ExpandedResource({
                        actionContext: this,
                        controller: options.controller
                    }),
                    instance = options.command.instance,
                    cache = options.adapter.req.globals['request-cache'];

                // Save the references in either byBase or byType
                if (instance.base) {
                    cache.byBase[instance.base] = newExpandedResource;
                } else if (instance.type) {
                    cache.byType[instance.type] = newExpandedResource;
                }
            }

            // Execute the original constructor: addons + controller call
            OriginalActionContext.apply(this, arguments);
        };

    RequestCacheDispatcher.prototype    = originalDispatcher;
    RequestCacheActionContext.prototype = OriginalActionContext.prototype;

    /**
     * A "superinstance" of mojito's Dispatcher
     * @type {Object}
     */
    Y.mojito.Dispatcher    = new RequestCacheDispatcher();
    Y.mojito.ActionContext = RequestCacheActionContext;

}, '0.1.0', {
    requires: [
        'mojito-dispatcher',
        'mojito-action-context'
    ]
});
