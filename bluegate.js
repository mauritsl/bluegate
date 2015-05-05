"use strict";

/**
 * Minimalistic Web Application Framework as Promised
 *
 * @module BlueGate
 */

var connect = require('connect');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var compression = require('compression');
var http = require('http');
var Promise = require('bluebird');
var url = require('url');

/**
 * Create a new webserver.
 * @constructor
 */
var BlueGate = function() {
  var self = this;

  this._app = connect();

  this._app.use(bodyParser.urlencoded({extended: false}));
  this._app.use(bodyParser.json());
  this._app.use(cookieParser());
  this._app.use(compression());

  this._app.use(function(req, res, next) {
    return self.handleRequest(req, res, next);
  });

  this.phases = [
    {name: 'initialize', concurrent: true, error: false},
    {name: 'authentication', concurrent: false, error: false},
    {name: 'authorisation', concurrent: false, error: false},
    {name: 'prevalidation', concurrent: true, error: false},
    {name: 'preprocess', concurrent: false, error: false},
    {name: 'postvalidation', concurrent: true, error: false},
    {name: 'process', concurrent: false, error: false},
    {name: 'postprocess', concurrent: false, error: false},
    {name: '_send', concurrent: false, error: false},
    {name: 'after', concurrent: true, error: false},
    {name: 'error', concurrent: false, error: true},
    {name: '_senderror', concurrent: false, error: true},
    {name: 'aftererror', concurrent: true, error: true}
  ];
  this.addRegisterFunctions(this);

  this._send(sendHandler);
  this.error(errorHandler);
  this._senderror(sendHandler);
};

/**
 * Listen for clients.
 *
 * @method listen
 * @param {int} port
 */
BlueGate.prototype.listen = function(port) {
  if (typeof port !== 'number') {
    throw Error('Missing port number');
  }
  this.server = http.createServer(this._app);
  return Promise.promisify(this.server.listen, this.server)(port);
};

/**
 * Add register functions to scope.
 *
 * @private
 * @method addRegisterFunctions
 * @param {object} scope
 */
BlueGate.prototype.addRegisterFunctions = function(scope) {
  var self = this;
  this.phases.forEach(function(phase) {
    scope['_' + phase.name + 'Callbacks'] = [];
    scope[phase.name] = function(path, fn) {
      var params = [];
      if (typeof fn === 'undefined') {
        fn = path;
        path = /./;
      }
      else {
        var parts = self.transformPath(path);
        path = parts.path;
        params = parts.params;
      }
      scope['_' + phase.name + 'Callbacks'].push({
        path: path,
        callback: fn,
        params: params
      });
    };
  });
};

/**
 * Transform path specification into regexp and extract params.
 *
 * @private
 * @method transformPath
 * @param {string} path
 * @return {object}
 */
BlueGate.prototype.transformPath = function(path) {
  var types = {
    'string': '[^\\/]+',
    'alpha': '[a-z]+',
    'alphanum': '[a-z0-9]+',
    'int': '[1-9][0-9]+',
    'signed': '\\-?[0-9]+',
    'unsigned': '[0-9]+',
    'float': '\\-?[0-9\\.]+',
    'uuid': '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  };
  path = path.split('/');
  var regexp = [];
  var params = [];
  path.forEach(function(part) {
    var dynamic = part.match(/^\<([a-z][a-z0-9]*)\:(string|alpha|alphanum"int|signed|unsigned|float|uuid)\>$/i);
    if (dynamic) {
      params.push({
        name: dynamic[1],
        type: dynamic[2]
      });
      regexp.push('(' + types[dynamic[2]] + ')');
    }
    else {
      regexp.push(part.replace(/[^\w\s]/g, '\\$&'));
    }
  });
  return {
    path: new RegExp('^' + regexp.join('\\/') + '$', 'i'),
    params: params
  };
};

/**
 * Handle request.
 *
 * @private
 * @method handleReques
 * @param {object} req Request objec
 * @param {object} res Response objec
 * @param {function} next Next middleware callback
 */
BlueGate.prototype.handleRequest = function(req, res, next) {
  var method = req.method;

  var urlParts = url.parse(req.url, true);
  // @todo Add start date (can be used for performance measures).
  var scope = {
    path: urlParts.pathname,
    method: method,
    body: req.body,
    mime: null,
    status: 200,
    query: urlParts.query,
    headers: req.headers,
    cookies: req.cookies,
    ip: req.connection.remoteAddress
  };
  this.addRegisterFunctions(scope);

  var hasError = false;
  Promise.resolve(this.phases).bind(this).each(function(phase) {
    if (phase.error === hasError) {
      var callbacks = this.getCallbacks(phase.name, method, scope.path, scope);
      // @todo 'all' does not seem to work.
      var iterator = phase.concurrent ? 'each' : 'each';
      if (phase.name[0] === '_') {
        // Internal phases are allowed to write to the response.
        scope.res = res;
      }
      else {
        delete scope.res;
      }
      return Promise.resolve(callbacks).bind(scope)[iterator](function(callback) {
        // @todo Provide params as function arguments.
        // @todo Let callback return output.
        this.params = callback.params;
        return callback.callback.apply(this);
      }).catch(function(error) {
        scope.error = error;
        hasError = true;
      });
    }
  });
};

/**
 * Get callbacks that match the given phase, method and path.
 *
 * @private
 * @method getCallbacks
 * @param {string} phase
 * @param {string} method
 * @param {string} path
 * @param {object} [scope]
 * @return {Array}
 */
BlueGate.prototype.getCallbacks = function(phase, method, path, scope) {
  var callbacks = [];
  var name = method + ' ' + path;
  var checkItem = function(item) {
    var match = name.match(item.path);
    if (match) {
      var params = {};
      for (var i = 0; i < item.params.length; ++i) {
        var value = match[i + 1];
        // @todo Transform type.
        params[item.params[i].name] = value;
      }
      callbacks.push({
        callback: item.callback,
        params: params
      });
    }
  };
  this['_' + phase + 'Callbacks'].forEach(checkItem);
  if (typeof scope === 'object') {
    scope['_' + phase + 'Callbacks'].forEach(checkItem);
  }
  return callbacks;
};

/**
 * Close HTTP server.
 *
 * @method close
 */
BlueGate.prototype.close = function() {
  return Promise.promisify(this.server.close, this.server)();
};

/**
 * Send response.
 */
var sendHandler = function() {
  var mime;
  if (typeof this.output === 'string') {
    mime = 'text/html';
  }
  else if (this.output instanceof Buffer) {
    mime = 'application/octet-stream';
  }
  else {
    mime = 'application/json';
    this.output = JSON.stringify(this.output, null, 2);
  }
  if (typeof this.mime === 'string') {
    mime = this.mime;
  }

  if (mime.substring(0, 5) === 'text/' && mime.indexOf('charset') < 0) {
    mime += '; charset=utf-8';
  }

  this.res.statusCode = this.status;
  this.res.setHeader('Content-Type', mime);
  this.res.end(this.output);
};

/**
 * Error handler.
 */
var errorHandler = function() {
  // @todo Set status to 400 for errors coming from validate callbacks.
  this.status = 500;
  this.output = {errors: ['Internal server error']};
};

module.exports = BlueGate;
