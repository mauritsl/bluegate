/* eslint-env node, mocha */
"use strict";

var Promise = require('bluebird');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

var needle = Promise.promisifyAll(require('needle'));

describe.only('BlueGate', function() {
  var BlueGate;
  var url = 'http://localhost:3000';

  before(function() {
    BlueGate = new (require('./bluegate.js'));
    return BlueGate.listen(3000);
  });

  after(function() {
    return BlueGate.close();
  });

  it('cannot start without port number', function() {
    var server = new (require('./bluegate.js'));
    expect(function() {
      server.listen();
    }).to.throw(Error);
  });

  it('can register new handler', function() {
    BlueGate.process('GET /url-test', function() {
      return this.path;
    });
  });

  it('can request test url', function() {
    return needle.getAsync(url + '/url-test').then(function(data) {
      var body = data[1];
      expect(body.toString()).to.equal('/url-test');
    });
  });

  it('returns a 404 page for unknown paths', function() {
    return needle.getAsync(url + '/not-found').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('will transform objects to JSON', function() {
    BlueGate.process('GET /json-test', function() {
      return {foo: 'bar'};
    });
    return needle.getAsync(url + '/json-test').then(function(data) {
      var body = data[1];
      expect(body).to.be.an('object');
      expect(body).to.deep.equal({foo: 'bar'});
    });
  });

  it('will give a 500 when unknown errors occur', function() {
    BlueGate.process('GET /500-test', function() {
      throw Error('Fail');
    });
    return needle.getAsync(url + '/500-test').then(function(data) {
      expect(data[0].statusCode).to.equal(500);
      expect(data[1]).to.deep.equal({errors: ['Internal server error']});
    });
  });

  it('can alter the error response', function() {
    BlueGate.error('GET /500-test', function() {
      expect(this.error instanceof Error).to.equal(true);
      this.status = 400;
      return 'Error!';
    });
    return needle.getAsync(url + '/500-test').then(function(data) {
      expect(data[0].statusCode).to.equal(400);
      expect(data[1]).to.equal('Error!');
    });
  });

  it('can add handlers in the initialize handler', function() {
    var init = function() {
      this.process(function() {
        return 'Hello world';
      });
    };
    BlueGate.initialize('GET /init-test', init);
    return needle.getAsync(url + '/init-test').then(function(data) {
      expect(data[1]).to.equal('Hello world');
    });
  });

  it('provides query arguments to callbacks', function() {
    BlueGate.process('GET /query-test', function() {
      return this.query;
    });
    return needle.getAsync(url + '/query-test?foo=bar&john=doe').then(function(data) {
      expect(data[1]).to.be.an('object');
      expect(data[1]).to.have.property('foo', 'bar');
      expect(data[1]).to.have.property('john', 'doe');
    });
  });

  it('uses octet-stream by default for buffers', function() {
    BlueGate.process('GET /buffer-test', function() {
      return new Buffer('test');
    });
    return needle.getAsync(url + '/buffer-test').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'application/octet-stream');
    });
  });

  it('can use custom mime type', function() {
    BlueGate.process('GET /mime-test', function() {
      this.mime = 'image/jpeg';
      this.output = new Buffer('test');
    });
    return needle.getAsync(url + '/mime-test').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'image/jpeg');
    });
  });

  it('will use mimetype text/html by default', function() {
    BlueGate.process('GET /mime-default', function() {
      this.output = '<html>';
    });
    return needle.getAsync(url + '/mime-default').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'text/html; charset=utf-8');
    });
  });

  it('will add charset on text when not set', function() {
    BlueGate.process('GET /missing-charset', function() {
      this.output = '<html>';
      this.mime = 'text/css';
    });
    return needle.getAsync(url + '/missing-charset').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'text/css; charset=utf-8');
    });
  });

  it('will not override charset when set', function() {
    BlueGate.process('GET /different-charset', function() {
      this.output = '<html>';
      this.mime = 'text/html; charset=iso-8859-1';
    });
    return needle.getAsync(url + '/different-charset').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'text/html; charset=iso-8859-1');
    });
  });

  /* Scope attributes */

  it('provides HTTP headers in this.headers', function() {
    BlueGate.process('GET /header-test', function() {
      this.output = this.headers;
    });
    var options = {
      headers: {'X-Test': '1234'}
    };
    return needle.getAsync(url + '/header-test', options).then(function(data) {
      expect(data[1]).to.be.an('object');
      expect(data[1]).to.have.property('x-test', '1234');
    });
  });

  it('provides cookies in this.cookies', function() {
    BlueGate.process('GET /cookie-test', function() {
      this.output = this.cookies;
    });
    var options = {
      headers: {'Cookie': 'foo=bar'}
    };
    return needle.getAsync(url + '/cookie-test', options).then(function(data) {
      expect(data[1]).to.be.an('object');
      expect(data[1]).to.have.property('foo', 'bar');
    });
  });

  it('provides client IP in this.ip', function() {
    BlueGate.process('GET /ip-test', function() {
      this.output = this.ip;
    });
    return needle.getAsync(url + '/ip-test').then(function(data) {
      // Travis gives us the IP "::ffff:127.0.0.1", we will match that too.
      expect(data[1]).to.contain('127.0.0.1');
    });
  });

  it('provides request date in this.date', function() {
    BlueGate.process('GET /date-test', function() {
      this.output = this.date / 1000;
    });
    return needle.getAsync(url + '/date-test').then(function(data) {
      // Check if the date is somewhere in the last second.
      var start = parseFloat(data[1]);
      var end = new Date() / 1000;
      expect(start > end - 1 && start < end).to.equal(true);
    });
  });

  /* Test params */

  it('can accept string params', function() {
    BlueGate.process('GET /article/<title:string>', function(title) {
      return title;
    });
    return needle.getAsync(url + '/article/testarticle').then(function(data) {
      expect(data[1]).to.equal('testarticle');
    });
  });

  it('cannot accept empty strings in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/article/').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('cannot accept slashes in string param', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/article/lorem/ipsum').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('can accept alpha params', function() {
    BlueGate.process('GET /node/by-alpha/<id:alpha>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-alpha/Asdf').then(function(data) {
      expect(data[1].value).to.be.a('string');
      expect(data[1].value).to.equal('Asdf');
    });
  });

  it('cannot accept non-alphanumeric characters in alpha params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-alpha/as-df').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('cannot accept numeric characters in alpha params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-alpha/asdf123').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('can accept alphanum params', function() {
    BlueGate.process('GET /node/by-alphanum/<id:alphanum>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-alphanum/Asdf123').then(function(data) {
      expect(data[1].value).to.be.a('string');
      expect(data[1].value).to.equal('Asdf123');
    });
  });

  it('cannot accept non-alphanumeric characters in alphanum params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-alphanum/as-df').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('can accept int params', function() {
    BlueGate.process('GET /node/by-int/<id:int>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-int/123').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(123);
    });
  });

  it('cannot accept negatives as int in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-int/-1').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('cannot accept zero as int in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-int/0').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('can accept unsigned params', function() {
    BlueGate.process('GET /node/by-unsigned/<id:unsigned>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-unsigned/123').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(123);
    });
  });

  it('cannot accept negatives as unsigned in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-unsigned/-1').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('can accept zero as unsigned in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-unsigned/0').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(0);
    });
  });

  it('can accept signed params', function() {
    BlueGate.process('GET /node/by-signed/<id:signed>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-signed/123').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(123);
    });
  });

  it('can accept negatives as signed in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-signed/-1').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(-1);
    });
  });

  it('can accept zero as signed in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-signed/0').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(0);
    });
  });

  it('can accept float params', function() {
    BlueGate.process('GET /node/by-float/<id:float>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-float/12.3').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(12.3);
    });
  });

  it('can accept negatives as float in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-float/-1').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(-1);
    });
  });

  it('can accept zero as float in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-float/0').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(0);
    });
  });

  it('can accept floats with only decimals in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-float/.5').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(.5);
    });
  });

  it('can accept uuid params', function() {
    BlueGate.process('GET /node/by-uuid/<id:uuid>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-uuid/3D7FD040-7054-4075-B68F-CE6099E9E6BF').then(function(data) {
      expect(data[1].value).to.be.a('string');
      expect(data[1].value.toUpperCase()).to.equal('3D7FD040-7054-4075-B68F-CE6099E9E6BF');
    });
  });

  it('cannot accept non-uuids in uuid params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-uuid/3D7FD040').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('will cast uuid params to lowercase for consistency', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-uuid/3D7FD040-7054-4075-B68F-CE6099E9E6BF').then(function(data) {
      expect(data[1].value).to.equal('3D7FD040-7054-4075-B68F-CE6099E9E6BF'.toLowerCase());
    });
  });

  it('can accept path params', function() {
    BlueGate.process('GET /node/by-path/<id:path>', function(id) {
      // Wrap value in an object, so it will use JSON encoding.
      return {
        value: id
      };
    });
    return needle.getAsync(url + '/node/by-path/this/is/a/test').then(function(data) {
      expect(data[1].value).to.be.a('string');
      expect(data[1].value).to.equal('this/is/a/test');
    });
  });

  it('will not match empty path params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-path/').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('will not include trailing slashes in path params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-path/trailing/slash/').then(function(data) {
      expect(data[1].value).to.equal('trailing/slash');
    });
  });
});
