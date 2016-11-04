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

require('bluegate-session')(app);
require('bluegate-class')(app);
require('bluegate-static')(app);
require('bluegate-handlebars')(app);

app.listen(config.port).then(() => {
  console.log('Listening on port :' + config.port);
});

/**
 * Add an error callback to log internal errors.
 */
app.error(function() {
  console.error(this.error);
});

/**
 * Register a CSRF token on every request.
 *
 * The token is based on the session id for simplicity.
 * But only use the first 8 bytes (out of 16) to avoid
 * leaking the session id.
 *
 * @see https://www.owasp.org/index.php/Cross-Site_Request_Forgery_(CSRF)
 */
app.initialize(function(session) {
  let token = '0';
  if (session) {
    const id = session.getId();
    token = String(id).substring(0, 8);
  }
  this.setParameter('csrfToken', token);
});
