/* eslint-disable */
"use strict";

var Promise = require('bluebird');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

var crypto = require('crypto');
var net = require('net');
var needle = Promise.promisifyAll(require('needle'), {multiArgs: true});
var Readable = require('stream').Readable;
var util = require('util');

module.exports = {
  'can handle callbacks in ES6 syntax': (BlueGate, url) => {
    BlueGate.process('GET /es6', () => {
      return {foo: 'bar'};
    });
    return needle.getAsync(url + '/es6').then(function(data) {
      expect(data[1]).to.have.property('foo', 'bar');
    });
  },

  'can handle parameters for ES6 callbacks': (BlueGate, url) => {
    BlueGate.process('GET /es6/param/<test:int>', (test) => {
      return {test};
    });
    return needle.getAsync(url + '/es6/param/123').then(function(data) {
      expect(data[1]).to.have.property('test', 123);
    });
  },

  'can provide "request" parameter for ES6 callbacks': (BlueGate, url) => {
    BlueGate.process('GET /es6/request', (request) => {
      return {
        test: request.getQuery('test', 'int')
      };
    });
    return needle.getAsync(url + '/es6/request?test=123').then(function(data) {
      expect(data[1]).to.have.property('test', 123);
    });
  },

  'can accept ES6 functions without parentheses around function arguments': (BlueGate, url) => {
    BlueGate.process('GET /es6/param/<test:int>', test => {
      return {test};
    });
    return needle.getAsync(url + '/es6/param/123').then(function(data) {
      expect(data[1]).to.have.property('test', 123);
    });
  }
};
