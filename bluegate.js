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
var retrieveArguments = require('retrieve-arguments');
var forwarded = require('forwarded-for');
var _ = require('lodash');

/**
 * Create a new webserver.
 * @constructor
 */
var BlueGate = function(options) {
  var self = this;

  this._options = _.defaults(options, {
    trustedProxies: ['127.0.0.1'],
    clickjacking: 'deny',
    noMimeSniffing: true,
    log: console.log
  });

  this._app = connect();

  this._app.use(bodyParser.urlencoded({extended: false}));
  this._app.use(bodyParser.json());
  this._app.use(cookieParser());
  this._app.use(compression());

  this._app.use(function(req, res, next) {
    return self.handleRequest(req, res, next);
  });

  this.phases = [
    {name: 'initialize', concurrent: true, error: false, errorStatus: 500},
    {name: 'authentication', concurrent: false, error: false, errorStatus: 401},
    {name: 'authorisation', concurrent: false, error: false, errorStatus: 403},
    {name: 'prevalidation', concurrent: true, error: false, errorStatus: 400},
    {name: 'preprocess', concurrent: false, error: false, errorStatus: 500},
    {name: 'postvalidation', concurrent: true, error: false, errorStatus: 400},
    {name: 'process', concurrent: false, error: false, errorStatus: 500},
    {name: 'postprocess', concurrent: false, error: false, errorStatus: 500},
    {name: '_send', concurrent: false, error: false},
    {name: 'after', concurrent: true, error: false},
    {name: 'error', concurrent: false, error: true, errorStatus: 500},
    {name: '_senderror', concurrent: false, error: true},
    {name: 'aftererror', concurrent: true, error: true}
  ];
  this.addRegisterFunctions(this);

  this._types = {
    'string': '[^\\/]+',
    'alpha': '[a-z]+',
    'alphanum': '[a-z0-9]+',
    'int': '[1-9][0-9]*',
    'signed': '\\-?[0-9]+',
    'unsigned': '[0-9]+',
    'float': '\\-?[0-9\\.]+',
    'uuid': '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
    'path': '.+?'
  };

  this._send(sendHandler);
  this.error(errorHandler);
  this._senderror(sendHandler);

  var log = this._options.log;
  if (typeof log === 'function') {
    this.after(function() { logHandler.apply(this, [log]); });
    this.aftererror(function() { logHandler.apply(this, [log]); });
  }
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
        params: params,
        arguments: retrieveArguments(fn)
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
  var types = this._types;
  path = path.split('/');
  var regexp = [];
  var params = [];
  path.forEach(function(part) {
    var dynamic = part.match(new RegExp('^\<([a-z][a-z0-9]*)\:(' + Object.keys(types).join('|') + ')\>$', 'i'));
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
 * Generate scope object.
 *
 * @private
 * @method generateScope
 * @param {object} req
 * @return {object}
 */
BlueGate.prototype.generateScope = function(req) {
  var self = this;
  var urlParts = url.parse(req.url, true);
  var getFrom = function(source) {
    return function(name, type, defaultValue) {
      if (typeof self._types[type] === 'undefined') {
        throw Error('Unknown type ' + type);
      }
      var pattern = new RegExp(self._types[type], 'i');
      if (typeof source[name] !== 'undefined' && String(source[name]).match(pattern)) {
        return self.convertValue(source[name], type);
      }
      return typeof defaultValue === 'undefined' ? null : defaultValue;
    };
  };
  var host = typeof req.headers.host === 'string' && req.headers.host.match(/^[a-z0-9\-\.]+$/im) ? req.headers.host : '';
  var scope = {
    host: host,
    // Trim trailing slashes from path.
    path: urlParts.pathname.replace(/(.)\/+$/, '$1'),
    method: req.method,
    body: req.body,
    mime: null,
    status: 200,
    query: Object.keys(urlParts.query),
    getQuery: getFrom(urlParts.query),
    headers: req.headers,
    cookies: Object.keys(req.cookies),
    getCookie: getFrom(req.cookies),
    ip: forwarded(req, req.headers, this._options.trustedProxies).ip,
    date: new Date(),
    secure: false,
    _outputHeaders: {},
    _options: this._options,
    setHeader: function(name, value, append) {
      if (name.match(/[^ -~]/) || value.match(/[^ -~]/)) {
        throw Error('HTTP-header cannot contain non-printable characters');
      }
      name = name.toLowerCase();
      if (typeof this._outputHeaders[name] === 'undefined') {
        this._outputHeaders[name] = [value];
      }
      else if (append) {
        this._outputHeaders[name].push(value);
      }
      else {
        this._outputHeaders[name] = [value];
      }
    },
    setCookie: function(name, value, expires, path, domain, httpOnly, secure) {
      httpOnly = httpOnly !== false;
      secure = typeof secure === 'boolean' ? secure : this.secure;
      if (String(name).match(/([^!-~]|\,\;\=)/) || String(value).match(/([^!-~]|\,\;)/)) {
        throw Error('Illegal characters in cookie name or value');
      }
      var parts = [name + '=' + value];
      if (expires instanceof Date) {
        parts.push('Expires=' + expires.toGMTString());
      }
      if (path && !String(path).match(/([^ -~]|\,\;)/)) {
        parts.push('Path=' + path);
      }
      if (domain && !String(domain).match(/([^!-~]|\,\;)/)) {
        parts.push('Domain=' + domain);
      }
      if (secure) {
        parts.push('Secure');
      }
      if (httpOnly) {
        parts.push('HttpOnly');
      }
      this.setHeader('Set-Cookie', parts.join('; '), true);
    }
  };
  if (scope.headers['x-forwarded-proto'] === 'https' || scope.headers['x-forwarded-proto'] === '"https"') {
    scope.secure = true;
  }
  this.addRegisterFunctions(scope);
  return scope;
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

  var scope = this.generateScope(req);

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
        this.parameters = callback.params;
        var args = [];
        callback.arguments.forEach(function(name) {
          args.push(callback.params[name]);
        });
        var result = callback.callback.apply(this, args);
        return Promise.resolve(result).then(function(output) {
          if ((typeof output !== 'undefined') && ['process', 'error'].indexOf(phase.name) >= 0) {
            scope.output = output;
          }
        });
      }).then(function() {
        // No process callback is found. Follow the error path for a 404 page.
        if (phase.name === 'process' && !callbacks.length) {
          this.status = 404;
          throw Error('Not found');
        }
      }).catch(function(error) {
        // Set error status code, when not already set.
        if (this.status < 300 && typeof phase.errorStatus !== 'undefined') {
          this.status = phase.errorStatus;
        }
        scope.error = error;
        hasError = true;
      });
    }
  });
};

/**
 * Convert value to provided type.
 *
 * @private
 * @method convertValue
 * @param {mixed} value
 * @param {string} type
 * @return {mixed}
 */
BlueGate.prototype.convertValue = function(value, type) {
  // Numeric types are casted to a number, others are passed as strings.
  if (['int', 'signed', 'unsigned', 'float'].indexOf(type) >= 0) {
    value = parseFloat(value);
  }
  if (type === 'uuid') {
    // Uuid's are always passed in lowercase for consistency.
    value = value.toLowerCase();
  }
  return value;
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
  var self = this;
  var callbacks = [];
  var name = method + ' ' + path;
  var checkItem = function(item) {
    var match = name.match(item.path);
    if (match) {
      var params = {};
      for (var i = 0; i < item.params.length; ++i) {
        var value = self.convertValue(match[i + 1], item.params[i].type);
        params[item.params[i].name] = value;
      }
      callbacks.push({
        callback: item.callback,
        arguments: item.arguments,
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
  var self = this;

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

  this.setHeader('Content-Type', mime);

  // Include anti clickjacking header for HTML responses.
  if (this._options.clickjacking && mime.substring(0, 9) === 'text/html') {
    this.setHeader('X-Frame-Options', this._options.clickjacking);
  }

  // Disable MIME-sniffing. This must be set for all content types.
  if (this._options.noMimeSniffing) {
    this.setHeader('X-Content-Type-Options', 'nosniff');
  }
  Object.keys(this._outputHeaders).forEach(function(name) {
    // Convert case ("content-type" to "Content-Type").
    var casedName = name.replace(/(^.|\-.)/g, function(part) {
      return part.toUpperCase();
    });
    self.res.setHeader(casedName, self._outputHeaders[name]);
  });

  this._length = this.output.length;
  this.res.statusCode = this.status;
  this.res.end(this.output);
};

/**
 * Log response.
 *
 * @param {function} log
 */
var logHandler = function(log) {
  var date = this.date.toISOString().substring(0, 19);
  var duration = new Date() - this.date;
  log(date + ' ' + this.ip + ' "' + this.method + ' ' + this.path + '" ' + this.status + ' ' + this._length + ' ' + duration);
};

/**
 * Error handler.
 */
var errorHandler = function() {
  var messages = {
    400: 'Bad request',
    401: 'Authentication required',
    403: 'Permission denied',
    404: 'Not found',
    500: 'Internal server error'
  };
  var error = typeof messages[this.status] === 'undefined' ? 500 : messages[this.status];
  this.output = {errors: [error]};
};

module.exports = BlueGate;
