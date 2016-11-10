
const BlueGate = require('bluegate');

var app = new BlueGate();

require('bluegate-class')(app);
require('bluegate-handlebars')(app);

app.listen(8080).then(() => {
  console.log('Listening on port :8080');
});

app.error(function() {
  if (this.status !== 404) {
    console.error(this.error);
  }
 });
