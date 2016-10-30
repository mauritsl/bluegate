/* eslint-env node, mocha */
"use strict";

var Promise = require('bluebird');
var chai = require("chai");
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var expect = chai.expect;

var net = require('net');
var needle = Promise.promisifyAll(require('needle'), {multiArgs: true});
var Readable = require('stream').Readable;
var util = require('util');

var lastLog;
var log = function(message) {
  lastLog = message;
};

describe('BlueGate', function() {
  var BlueGateModule = require('./bluegate.js');

  var BlueGate;
  var url = 'http://localhost:3000';

  // Options to use for net.connect().
  var netOptions = {
    host: 'localhost',
    port: 3000,
    allowHalfOpen: true
  };

  before(function() {
    BlueGate = new BlueGateModule({
      log: log
    });
    return BlueGate.listen(3000);
  });

  after(function() {
    return BlueGate.close();
  });

  it('cannot start without port number', function() {
    var server = new BlueGateModule({
      log: log
    });
    expect(function() {
      server.listen();
    }).to.throw(Error);
  });

  it('can start without providing options', function() {
    var server = new BlueGateModule();
    return server.listen(3001).then(function() {
      return server.close();
    });
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

  it('will parse JSON input', function() {
    BlueGate.process('POST /json-post', function() {
      return this.body;
    });
    var input = {foo: 'bar'};
    var options = {json: true};
    return needle.postAsync(url + '/json-post', input, options).then(function(data) {
      var body = data[1];
      expect(body).to.be.an('object');
      expect(body).to.deep.equal(input);
    });
  });

  it('will pass non-JSON input as buffer', function() {
    BlueGate.process('POST /json-post', function() {
      return this.body;
    });
    var input = new Buffer('test');
    var options = {
      headers: {
        'Content-Type': 'application/foo'
      }
    };
    return needle.postAsync(url + '/json-post', input, options).then(function(data) {
      var body = data[1];
      expect(body.toString()).to.equal(input.toString());
    });
  });

  [
    {name: 'initialize', status: 500, message: 'Internal server error'},
    {name: 'authentication', status: 401, message: 'Authentication required'},
    {name: 'authorisation', status: 403, message: 'Permission denied'},
    {name: 'prevalidation', status: 400, message: 'Bad request'},
    {name: 'preprocess', status: 500, message: 'Internal server error'},
    {name: 'postvalidation', status: 400, message: 'Bad request'},
    {name: 'process', status: 500, message: 'Internal server error'},
    {name: 'postprocess', status: 500, message: 'Internal server error'}
  ].forEach(function(phase) {
    var outputFunction = function() {
      return '';
    };
    var errorFunction = function() {
      throw Error('Fail');
    };
    it('will give a ' + phase.status + ' when errors occur during ' + phase.name, function() {
      BlueGate.process('GET /http-status-' + phase.name, outputFunction);
      BlueGate[phase.name]('GET /http-status-' + phase.name, errorFunction);
      return needle.getAsync(url + '/http-status-' + phase.name).then(function(data) {
        expect(data[0].statusCode).to.equal(phase.status);
        expect(data[1]).to.deep.equal({errors: [phase.message]});
      });
    });
  });

  it('can alter the error response', function() {
    BlueGate.process('GET /500-test', function() {
      throw Error('Fail');
    });
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

  it('provides query argument names to callbacks', function() {
    BlueGate.process('GET /query-test', function() {
      return this.query;
    });
    return needle.getAsync(url + '/query-test?foo=bar&john=doe').then(function(data) {
      expect(data[1]).to.be.an('array');
      expect(data[1]).to.include('foo');
      expect(data[1]).to.include('john');
    });
  });

  it('can get query argument value', function() {
    BlueGate.process('GET /query-value', function() {
      return {
        asInt: this.getQuery('test', 'int'),
        asString: this.getQuery('test', 'string'),
        asBool: this.getQuery('test', 'bool')
      };
    });
    return needle.getAsync(url + '/query-value?test=1').then(function(data) {
      expect(data[1].asInt).to.equal(1);
      expect(data[1].asString).to.equal('1');
      expect(data[1].asBool).to.equal(true);
    });
  });

  it('will use null for query value when not provided', function() {
    BlueGate.process('GET /query-not-provided', function() {
      return {value: this.getQuery('test', 'int')};
    });
    return needle.getAsync(url + '/query-not-provided').then(function(data) {
      expect(data[1].value).to.equal(null);
    });
  });

  it('will use default value for query value when not provided', function() {
    BlueGate.process('GET /query-default', function() {
      return {value: this.getQuery('test', 'int', 1)};
    });
    return needle.getAsync(url + '/query-default').then(function(data) {
      expect(data[1].value).to.equal(1);
    });
  });

  it('cannot get query argument value with unknown type', function() {
    BlueGate.process('GET /query-wrong-type', function() {
      this.getQuery('test', 'test');
    });
    return needle.getAsync(url + '/query-wrong-type?test=34').then(function(data) {
      expect(data[0].statusCode).to.equal(500);
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

  it('provides cookie names in this.cookies', function() {
    BlueGate.process('GET /cookie-names', function() {
      return {
        value: this.cookies
      };
    });
    var options = {
      headers: {'Cookie': 'foo=34'}
    };
    return needle.getAsync(url + '/cookie-names', options).then(function(data) {
      expect(data[1].value).to.deep.equal(['foo']);
    });
  });

  it('can get cookie value from this.getCookie', function() {
    BlueGate.process('GET /cookie-value', function() {
      return {
        asInt: this.getCookie('foo', 'int'),
        asString: this.getCookie('foo', 'string')
      };
    });
    var options = {
      headers: {'Cookie': 'foo=34'}
    };
    return needle.getAsync(url + '/cookie-value', options).then(function(data) {
      expect(data[1].asInt).to.equal(34);
      expect(data[1].asString).to.equal('34');
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

  it('can accept 1 as int in params', function() {
    // Use the callback from last case.
    return needle.getAsync(url + '/node/by-int/1').then(function(data) {
      expect(data[1].value).to.be.a('number');
      expect(data[1].value).to.equal(1);
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

  it('will decode parameters', function() {
    BlueGate.process('GET /decode-path/<url:string>', function(url) {
      return {
        url: url
      };
    });
    return needle.getAsync(url + '/decode-path/http%3A%2F%2Fexample.com%2F').then(function(data) {
      expect(data[1].url).to.equal('http://example.com/');
    });
  });

  it('will reject illegal encoded parameters', function() {
    // Use callback from last test.
    // Note that the last "F" is missing (%2 instead of %2F).
    return needle.getAsync(url + '/decode-path/http%3A%2F%2Fexample.com%2').then(function(data) {
      expect(data[0].statusCode).to.equal(404);
    });
  });

  it('will not include trailing slashes in path params', function() {
    return needle.getAsync(url + '/node/by-path/trailing/slash/').then(function(data) {
      expect(data[1].value).to.equal('trailing/slash');
    });
  });

  it('will duplicate params in scope.parameters', function() {
    BlueGate.process('GET /parameters-scope-test/<title:string>', function() {
      return this.parameters;
    });
    return needle.getAsync(url + '/parameters-scope-test/LoremIpsum').then(function(data) {
      expect(data[1]).to.be.an('object');
      expect(data[1]).to.have.property('title', 'LoremIpsum');
    });
  });

  it('can set extra parameter in callback', function() {
    BlueGate.initialize('GET /extra-params', function() {
      this.setParameter('foo', 'bar');
    });
    BlueGate.process('GET /extra-params', function(foo) {
      return {value: foo};
    });
    return needle.getAsync(url + '/extra-params').then(function(data) {
      expect(data[1].value).to.equal('bar');
    });
  });

  it('will override existing parameters in setParameter', function() {
    BlueGate.initialize('GET /extra-params/<foo:string>', function(foo) {
      this.setParameter('foo', 'bar');
    });
    BlueGate.process('GET /extra-params/<foo:string>', function(foo) {
      return {value: foo};
    });
    return needle.getAsync(url + '/extra-params/baz').then(function(data) {
      expect(data[1].value).to.equal('bar');
    });
  });


  it('can add HTTP headers', function(done) {
    BlueGate.process('GET /set-header', function(id) {
      this.setHeader('X-Generator', 'Test');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-header HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('X-Generator: Test');
      done();
    });
  });

  it('can append HTTP headers', function(done) {
    BlueGate.process('GET /append-header', function(id) {
      this.setHeader('Cookie', 'foo=bar', true);
      this.setHeader('Cookie', 'bar=baz', true);
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /append-header HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Cookie: foo=bar');
      expect(data).to.contain('Cookie: bar=baz');
      done();
    });
  });

  it('handles mime with precedence over setHeader', function() {
    BlueGate.process('GET /set-mime-header', function(id) {
      this.mime = 'text/xml; charset=utf-8';
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
    });
    return needle.getAsync(url + '/set-mime-header').then(function(data) {
      expect(data[0].headers).to.have.property('content-type', 'text/xml; charset=utf-8');
    });
  });

  it('knows that connection is (not) secure', function() {
    BlueGate.process('GET /check-secure', function(id) {
      return {secure: this.secure};
    });
    return needle.getAsync(url + '/check-secure').then(function(data) {
      expect(data[1].secure).to.equal(false);
    }).then(function() {
      var options = {
        headers: {'X-Forwarded-Proto': 'https'}
      };
      return needle.getAsync(url + '/check-secure', options);
    }).then(function(data) {
      expect(data[1].secure).to.equal(true);
    }).then(function() {
      // The value may be a quoted string.
      // @see http://tools.ietf.org/html/rfc7230#section-3.2.6
      var options = {
        headers: {'X-Forwarded-Proto': '"https"'}
      };
      return needle.getAsync(url + '/check-secure', options);
    }).then(function(data) {
      expect(data[1].secure).to.equal(true);
    });
  });

  it('will not accept newlines in HTTP-headers', function(done) {
    BlueGate.process('GET /header-injection', function(id) {
      this.setHeader('Cookie', 'foo=bar\nX-Hacked: true', true);
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /header-injection HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('HTTP/1.1 500 Internal Server Error');
      expect(data).to.not.contain('foo=bar\nX-Hacked: true');
      done();
    });
  });

  it('can set a cookie with this.setCookie', function(done) {
    BlueGate.process('GET /set-cookie', function(id) {
      this.setCookie('foo', 'bar');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; HttpOnly\r\n');
      done();
    });
  });

  it('can set a cookie with expire date', function(done) {
    BlueGate.process('GET /set-cookie/expire', function(id) {
      var expires = new Date('2020-01-01T00:00:00Z');
      this.setCookie('foo', 'bar', expires);
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/expire HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; Expires=Wed, 01 Jan 2020 00:00:00 GMT; HttpOnly\r\n');
      done();
    });
  });

  it('can set a cookie with path', function(done) {
    BlueGate.process('GET /set-cookie/path', function(id) {
      this.setCookie('foo', 'bar', null, '/test');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/path HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; Path=/test; HttpOnly\r\n');
      done();
    });
  });

  it('can set a cookie with domain', function(done) {
    BlueGate.process('GET /set-cookie/domain', function(id) {
      this.setCookie('foo', 'bar', null, null, '.example.com');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/domain HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; Domain=.example.com; HttpOnly\r\n');
      done();
    });
  });

  it('can set a cookie with secure flag', function(done) {
    BlueGate.process('GET /set-cookie/secure', function(id) {
      this.setCookie('foo', 'bar', null, null, null, true, true);
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/secure HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; Secure; HttpOnly\r\n');
      done();
    });
  });

  it('uses secure flag by default when visited over SSL', function(done) {
    BlueGate.process('GET /set-cookie/secure-default', function(id) {
      this.setCookie('foo', 'bar');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/secure-default HTTP/1.0\r\nX-Forwarded-Proto: https\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar; Secure; HttpOnly\r\n');
      done();
    });
  });

  it('cannot set a cookie with illegal characters', function(done) {
    BlueGate.process('GET /set-cookie/illegal-chars', function(id) {
      this.setCookie('foo', 'bar\tbaz');
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/illegal-chars HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('HTTP/1.1 500 Internal Server Error');
      expect(data).to.not.contain('Set-Cookie: foo=bar\tbaz; Domain=.example.com; HttpOnly\r\n');
      done();
    });
  });

  it('can set cookies without HttpOnly flag when asked for', function(done) {
    BlueGate.process('GET /set-cookie/no-httponly', function(id) {
      this.setCookie('foo', 'bar', null, null, null, false);
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /set-cookie/no-httponly HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Set-Cookie: foo=bar\r\n');
      done();
    });
  });

  it('will prevent clickjacking by default for html responses', function(done) {
    BlueGate.process('GET /no-clickjacking', function(id) {
      return 'test';
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /no-clickjacking HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('X-Frame-Options: deny');
      done();
    });
  });

  it('will not include X-Frame-Options for non-html responses', function(done) {
    BlueGate.process('GET /no-clickjacking/non-html', function(id) {
      return {};
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /no-clickjacking/non-html HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.not.contain('X-Frame-Options: deny');
      done();
    });
  });

  it('will prevent mime sniffing by default', function(done) {
    BlueGate.process('GET /no-mimesniffing', function(id) {
      return 'test';
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /no-mimesniffing HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('X-Content-Type-Options: nosniff');
      done();
    });
  });

  it('will include hostname in this.host', function(done) {
    BlueGate.process('GET /host-test', function(id) {
      return this.host;
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /host-test HTTP/1.0\r\nHost: test.example.com\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('test.example.com');
      done();
    });
  });

  it('will not include hostname in this.host when host is invalid', function(done) {
    BlueGate.process('GET /host-test', function(id) {
      return this.host;
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /host-test HTTP/1.0\r\nHost: !!fooled\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.not.contain('!!fooled');
      done();
    });
  });

  it('will log requests', function() {
    expect(lastLog).to.match(/^20[0-9]{2}\-[0-9]{2}\-[0-9]{2}T[012][0-9]\:[0-9]{2}\:[0-9]{2} [0-9a-f\.\:]+ "[^"]+" [0-9]{3} [0-9]+ [0-9]+$/im);
  });

  it('can handle streams as process result', function(done) {
    BlueGate.process('GET /stream-test', function() {
      var TestStream = function(options) {
        Readable.call(this, options);
        this.counter = 0;
      };
      util.inherits(TestStream, Readable);
      TestStream.prototype._read = function() {
        this.push(++this.counter > 1 ? null : 'Lorem ipsum');
      };
      return new TestStream();
    });
    var socket = net.connect(netOptions);
    var data = '';
    socket.on('connect', function() {
      socket.end("GET /stream-test HTTP/1.0\r\nConnection: Close\r\n\r\n");
    }).on('data', function(chunk) {
      data += chunk.toString();
    }).on('close', function() {
      expect(data).to.contain('Lorem ipsum');
      done();
    });
  });

  it('can use Express middleware', function() {
    var app = new BlueGateModule({log: log});
    app.use(function(req, res, next) {
      var parts = require('url').parse(req.url, true);
      if (typeof parts.query.redirect !== 'undefined') {
        res.statusCode = 302;
        res.setHeader('Location', '/');
        res.end();
      }
      else {
        next();
      }
    });
    app.process('GET /test', function() {
      return {};
    });
    return app.listen(3001).then(function() {
      return needle.getAsync('http://localhost:3001/test?redirect=1');
    }).then(function(data) {
      expect(data[0].statusCode).to.equal(302);
      return needle.getAsync('http://localhost:3001/test');
    }).then(function(data) {
      expect(data[0].statusCode).to.equal(200);
      return app.close();
    });
  });

  it('cannot set Express middleware after starting application', function() {
    var app = new BlueGateModule({log: log});
    var use = function() {
      app.use(function(req, res, next) { /* ... */ });
    };
    return app.listen(3001).then(function() {
      expect(use).to.throw(Error);
    }).then(function() {
      return app.close();
    });
  });

  it('can listen on unix socket', function(done) {
    var app = new BlueGateModule({log: log});
    var path = '/tmp/bluegate-test.sock';
    app.listen(path).then(function() {
      var netOptions = {
        path: path,
        allowHalfOpen: true
      };
      var socket = net.connect(netOptions);
      var data = '';
      socket.on('connect', function() {
        socket.end("GET / HTTP/1.0\r\nConnection: Close\r\n\r\n");
      }).on('data', function(chunk) {
        data += chunk.toString();
      }).on('close', function() {
        app.close();
        expect(data).to.contain('404 Not Found');
        done();
      });
    });
  });
});
