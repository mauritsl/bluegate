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

