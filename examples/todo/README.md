Todo example application
==================

The "Todo" example is a remake of the [TodoMVC](http://todomvc.com/)
application in BlueGate, including the
[class](https://www.npmjs.com/package/bluegate-class),
[csrf](https://www.npmjs.com/package/bluegate-csrf),
[handlebars](https://www.npmjs.com/package/bluegate-handlebars) and
[session](https://www.npmjs.com/package/bluegate-session) submodules.

## Running

Running **Redis** for the session storage is required to run this application.
You can run it using Docker with the commands below:

```
docker run --name tododb -d -p 6379:6379 redis
node index.js
```

You may add a ``--port=80`` option to run at a different port.

And cleanup Redis container after running:
```
docker stop tododb && docker rm tododb
```

## Testing

Tests are included and written using [CasperJS](http://casperjs.org/).

You can run the test using ``npm test``. This requires
a running application on port 7263, a Redis server on localhost
and a PhantomJS binary available.

Run the coverage test using ``npm run coverage``.
Do not run the NodeJS application yourself as this command will start one,
but you still need Redis and PhantomJS.
