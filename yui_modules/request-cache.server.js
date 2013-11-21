/*
 * Copyright (c) 2011-2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */
/*jslint nomen: true, indent: 4, plusplus: true*/
/*global YUI, YUITest */

YUI.add('request-cache', function (Y, NAME) {
    'use strict';

    var originalDispatcher     = Y.mojito.Dispatcher,
        OriginalActionContext  = Y.mojito.ActionContext,
        RequestCacheDispatcher = function () {

            var staticAppConfig,
                refreshedAddons;

            this.dispatch = function (command, adapter) {

                var cache,
                    cachedResource,
                    newCommand,
                    i,
                    addonName,
                    addonInstance,
                    AddonConstuct,
                    freshInstance = command.instance;

                // Build cache if it doesn't exist.
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

                // If there is a cached resource, dispatch with that.
                if (cachedResource) {

                    if (!refreshedAddons) {
                        staticAppConfig = this.store.getStaticAppConfig();
                        refreshedAddons = staticAppConfig['request-cache'] && staticAppConfig['request-cache'].refreshAddons;
                        if (!refreshedAddons) {
                            refreshedAddons = [];
                        }
                    }

                    newCommand = cachedResource.actionContext.command;

                    // debugger;
                    // We want the new params and action
                    newCommand.params = command.params;
                    newCommand.action = command.instance.action || newCommand.action;


                    // This is specific to mojito-pipeline
                    newCommand.task = command.task;

                    Y.mix(newCommand.instance.config, command.instance.config, true);

                    // Instantiate again the addons that need to be refreshed
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

                    // @see: ActionContext constructor
                    // TODO: handle __call
                    // TODO: handle staticAppConfig.actionTimeout
                    if (Y.Lang.isFunction(cachedResource.controller[newCommand.action])) {
                        cachedResource.controller[newCommand.action](cachedResource.actionContext);
                    }
                } else {
                    // Expands the command.instance and creates a new AC
                    // which in turn instanciates all the addons and calls the controller
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
