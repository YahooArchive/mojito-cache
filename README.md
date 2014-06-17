#mojito-cache

[![Build Status](https://travis-ci.org/yahoo/mojito-cache.png)](https://travis-ci.org/yahoo/mojito-cache)


Mojito Cache is a package of caching libraries that perform optimizations that
are not natively supported by mojito and are not necessarily desirable in the
mainstream mojito distribution.
Mojito Cache allows the reuse of the same Action Context between mojit instances of the same type, which is appropriate in most cases. Mojito Cache is not intended as a communication facility between mojit instances, but rather as a transparent optimization mechanism for high performance applications.

##Usage
In the application configuration file (often `application.yaml`) include the
following properties:
```yaml
	"request-cache": {
		"refreshAddons": ["myAddon"]
	}
```

You can specify the list of addons that need to be refreshed across mojit
instances FOR THE SAME REQUEST. Caching in that context can be useful if
much is shared between mojits instances on the same page. Typically `'params'`
and `'config'` need to be refreshed for the instances to render differently.
