Minimalistic Web Application Framework as Promised
==================

[![Build Status](https://travis-ci.org/mauritsl/bluegate.svg?branch=master)](https://travis-ci.org/mauritsl/bluegate)
[![Coverage Status](https://coveralls.io/repos/mauritsl/bluegate/badge.svg?branch=master)](https://coveralls.io/r/mauritsl/bluegate?branch=master)
[![Dependency Status](https://david-dm.org/mauritsl/bluegate.svg)](https://david-dm.org/mauritsl/bluegate)

BlueGate is a simple framework to build web applications in NodeJS.
It is build on top of the powerful
[Bluebird](https://github.com/petkaantonov/bluebird) library to let you
use the ease of Promises to its fullest extent.

Instead of a simple stack with middleware, BlueGate has a sophisticated
request flow that fits both REST API's and complex multi-tier applications.

## Installation

Install using ``npm install bluegate``

## Quick example

```javascript
var BlueGate = require('bluegate');

var app = new BlueGate();
app.listen(8080);

app.validate('GET /user/<id:int>', function(id) {
  if (id === 123) {
    throw Error('This is not a valid user id');
  }
});
app.process('GET /user/<id:int>', function(id) {
  // Return page content or promise for content.
  return {id: id};
});

app.process('GET /user/<id:int>/picture', function(id) {
  this.mime = 'image/jpeg';
  return new Buffer('...');
);
```

## Request flow

Each request follows the steps below:

- ``initialize`` can be used to register request specific handlers
- ``authentication`` should be used to identify the client
- ``authorisation`` should be used for permission checks
- ``prevalidation`` does validation before preprocessing
- ``preprocess`` does the preprocessing (e.g. parsing body)
- ``postvalidation`` does validation after preprocessing
- ``process`` will generate the output
- ``postprocess`` can alter the output (e.g. for templating)
- send response to client
- ``after`` is for additional work (e.g. statistics)

All remaining steps are skipped when an error occur before sending the response,
In that case, we will arrive at the error-flow:

- ``error`` is used to generate the error response for the client
- send response to client
- ``aftererror`` is for additional work (e.g. statistics)

The name of each step is used as function name to register handlers for it.
This can be done on the BlueGate instance (as shown in the example above) or
on the ``this`` scope within a handler. The first argument is in the form
``METHOD /path`` and determines which requests it can handle. This argument
can be omitted to enable the handler for all requests.
