/* no-process-exit: 0 */
'use strict';

const ChildProcess = require('child_process');

const app = require('./index.js');

app.ready.then(() => {
  const test = ChildProcess.spawn('npm', ['test'], {stdio: 'inherit'});
  test.on('exit', code => {
    app.close().then(() => {
      process.exit(code);
    });
  });
});
