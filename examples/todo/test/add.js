/* global casper, phantom */
'use strict';

casper.test.begin('Add todo', {
  test: function(test) {
    phantom.clearCookies();
    casper.start('http://localhost:7263/', function() {
      test.assertExists('form[action=\'/\']', 'add form is found');
      this.fill('form[action=\'/\']', {
        text: ''
      }, true);
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 0);
      test.assertTextExists('Please type some text to add a todo.', 'gives notice of missing text');
    });

    casper.run(function() {
      test.done();
    });
  }
});
