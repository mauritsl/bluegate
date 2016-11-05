/* global casper, phantom */
'use strict';

casper.test.begin('Basic operations', {
  test: function(test) {
    phantom.clearCookies();
    casper.start('http://localhost:7263/', function() {
      test.assertTitle('Todo', 'page title is set');
      test.assertElementCount('.items > div', 0);
      test.assertElementCount('.clear-completed', 0);
      test.assertExists('form[action=\'/\']', 'add form is found');
      this.fill('form[action=\'/\']', {
        text: 'This is a test'
      }, true);
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 1);
      test.assertTextExists('All (1)', 'tab "All (1)" exists');
      test.assertTextExists('Todo (1)', 'tab "Todo (1)" exists');
      test.assertTextExists('Completed (0)', 'tab "Completed (0)" exists');
      test.assertElementCount('.clear-completed', 0);
      this.clickLabel('Completed (0)');
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 0);
      test.assertElementCount('.clear-completed', 0);
      this.clickLabel('Todo (1)');
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 1);
      test.assertElementCount('.clear-completed', 0);
      this.click('.ready-link');
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 0);
      test.assertTextExists('All (1)', 'tab "All (1)" exists');
      test.assertTextExists('Todo (0)', 'tab "Todo (0)" exists');
      test.assertTextExists('Completed (1)', 'tab "Completed (1)" exists');
      test.assertElementCount('.clear-completed', 1);
      this.click('.clear-completed');
    });

    casper.then(function() {
      test.assertElementCount('.items > div', 0);
      test.assertTextExists('All (0)', 'tab "All (0)" exists');
      test.assertTextExists('Todo (0)', 'tab "Todo (0)" exists');
      test.assertTextExists('Completed (0)', 'tab "Completed (0)" exists');
      test.assertElementCount('.clear-completed', 0);
    });

    casper.run(function() {
      test.done();
    });
  }
});
