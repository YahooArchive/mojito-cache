#mojito-cache
Mojito Cache is a package of caching libraries that perform optimizations that
are not natively supported by mojito andare not necessarily desirable in the
mainstream mojito distribution.

[![Build Status](https://travis-ci.org/yahoo/mojito-cache.png)](https://travis-ci.org/yahoo/mojito-cache)


##Usage
In the application configuration file (often `application.yaml`) include the
following properties:
```yaml
	"request-cache": {
		"refreshAddons": ["myAddon"]
	}
}
```

You can specify the list of addons that need to be refreshed across mojit
instances FOR THE SAME REQUEST. Caching in that context can be useful if
much is shared between mojits instances on the same page. Typically `'params'`
and `'config'` need to be refreshed for the instances to render differently.
