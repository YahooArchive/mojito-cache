/*
 * Copyright (c) 2011-2013, Yahoo! Inc.  All rights reserved.
 * Copyrights licensed under the New BSD License.
 * See the accompanying LICENSE file for terms.
 */
/*jslint nomen: true, indent: 4*/

/*
 * Copyright (c) 2013 Yahoo! Inc. All rights reserved.
 */

YUI.add('request-cache', function (Y, NAME) {
    'use strict';

    var originalDispatcher     = Y.mojito.Dispatcher,
        OriginalActionContext  = Y.mojito.ActionContext,
        RequestCacheDispatcher = function () {

            this.dispatch = function (command, adapter) {

                var refreshedAddons,
                    staticAppConfig,
                    cache,
                    cachedResource,
                    newCommand,
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

                    staticAppConfig = this.store.getStaticAppConfig();

                    // Merge the cached command and the fresh command
                    newCommand = Y.merge(cachedResource.actionContext.command, command);

                    // That was brutal - the cached command had properties that we wanted
                    // but they got overwritten by smaller objects from the fresh, unexpanded command.
                    // But we can' use Y.mix with the more delicate (recursive) merging because
                    // the command may contain circular references. So now we need to cherry-pick.
                    //
                    // We need to mix-in the expanded instance from the cache without overwriting
                    // the properties from the fresh command.instance.
                    // Here again we can't use merge because of circular references.
                    Y.mix(newCommand.instance, cachedResource.actionContext.command.instance);

                    // So we didn't overwite the instance.config, but the cached instance bears
                    // some config that we want to retain, but we don't overwite to give
                    // priority to the fresh config.
                    // We're assuming there isn't any circular references here, so we merge.
                    Y.mix(newCommand.instance.config, cachedResource.actionContext.command.instance.config, false, null, 0, true);

                    // The cached AC gets the new command.
                    // TODO: verify we never need to clone this to avoid conflicts with resuming
                    // executions (e.g. in mojito-pipeline)
                    cachedResource.actionContext.command = newCommand;


                    // Instantiate again the addons that need to be refreshed
                    refreshedAddons = staticAppConfig['request-cache'] && staticAppConfig['request-cache'].refreshAddons;
                    Y.Array.each(refreshedAddons, function (addonName) {

                        var addonInstance,
                            AddonConstuct = Y.mojito.addons.ac[addonName];

                        if (AddonConstuct) {
                            addonInstance = new AddonConstuct(newCommand, adapter, cachedResource.actionContext);

                            if (addonInstance.namespace && cachedResource.actionContext[addonInstance.namespace]) {

                                cachedResource.actionContext[addonInstance.namespace] = addonInstance;

                                if (Y.Lang.isFunction(addonInstance.setStore)) {
                                    addonInstance.setStore(cachedResource.store);
                                }
                            }
                        }
                    });

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
            this.store         = options.store;
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
