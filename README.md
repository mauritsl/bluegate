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

## Writing handlers

### Input

Handler functions can accept input via both function arguments and the local
scope (``this``).
Input from path parameters is mapped to function arguments. Function arguments
that do not have a parameter will get ``undefined`` as value.

```javascript
app.process('GET /user/<name:string>', function(type, name) {
  typeof type === 'undefined';
  typeof name === 'string';
});
```

Other input is available in the local scope, accessible with ``this.*``.
The table below lists all available variables.

Name     | Type   | Example               | Read only?
---------|--------|-----------------------|-----------
path     | string | /user/john            | yes
method   | string | GET                   | yes
body     | buffer |                       | yes
mime     | string | text/html             | no
status   | int    | 200                   | no
query    | object | {page: 3}             | yes
headers  | object | {'User-Agent': '...'} | yes
cookies  | object | {sessionid: '...'}    | yes
ip       | string | 127.0.0.1             | yes
date     | date   |                       | yes

### Output

Output is provided as return value. This can be provided as strings, buffers
or any JSON serializable value. The MIME-type defaults to "text/html" when
using strings, "application/octet-stream" for buffers and "application/json"
for other types. JSON output is automatically encoded.

Use ``this.mime`` to set a different MIME-type.

```javascript
app.process('GET /image', function() {
  this.mime = 'image/jpeg';
  return new Buffer('...');
});
```

### HTTP headers

HTTP headers can be set using the ``setHeader`` function.

```javascript
app.preprocess('GET /path', function() {
  this.setHeader('X-Generator', 'CMS');
});
```

An optional thirth argument can be provided to append headers instead of
replacing them.

```javascript
app.preprocess('GET /path', function() {
  this.setHeader('Cookie', 'foo=bar');
  this.setHeader('Cookie', 'bar=baz');
});
```

### HTTP status code

The HTTP status code is 200 by default. This code is changed automatically
when an error occurs. The HTTP status for errors is dependent on the phase in
which the error occurred.

Phase              | Code | Message
-------------------|------|------------------------
``initialize``     | 500  | Internal server error
``authentication`` | 401  | Authentication required
``authorisation``  | 403  | Permission denied
``prevalidation``  | 400  | Bad request
``preprocess``     | 500  | Internal server error
``postvalidation`` | 400  | Bad request
``process``        | 500  | Internal server error
``postprocess``    | 500  | Internal server error

Additionally, a ``404`` response ("Not found") is provided when no ``process``
handler was found. All phases before ``process`` are still executed, because
it is possible that those will register a ``process`` handler.

It is possible to override the status code from within a handler using
``this.status``.

```javascript
app.process('POST /object', function() {
  this.status = 201;
  return {messages: ['Created']);
});
```
