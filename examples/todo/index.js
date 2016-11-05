'use strict';

const rc = require('rc');
const BlueGate = require('bluegate');

/**
 * Use RC to manage the configuration.
 * This allows us to override the port in a "todorc" file or
 * on the command line using "--port=80".
 */
const config = rc('todo', {
  port: 8080
});

/**
 * Setup the BlueGate application.
 */
const app = new BlueGate();

require('bluegate-class')(app);
require('bluegate-handlebars')(app);
require('bluegate-session')(app);
require('bluegate-static')(app);
require('bluegate-csrf')(app);

app.ready = app.listen(config.port).then(() => {
  console.log('Listening on port :' + config.port);
});

/**
 * Add an error callback to log internal errors.
 */
app.error(function() {
  if (this.status !== 404) {
    console.error(this.error);
  }
});

module.exports = app;
