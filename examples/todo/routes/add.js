'use strict';

const Uuid = require('uuid');

const IndexRoute = require('./index');

/**
 * @Route("POST /", list="all", template="index")
 * @Route("POST /list/<list:string>", template="index")
 * @Post("text", type="string")
 * @Csrf(true)
 */
class AddRoute extends IndexRoute {
  /**
   * Create a new route.
   *
   * Register a redirect function in this object.
   * This needs to be done in the constructor because
   * only the constructor has access to the request object.
   */
  constructor(request) {
    super();
    this.redirect = target => {
      request.setHeader('Location', target);
      request.status = 303;
      return '';
    };
  }

  /**
   * Process form.
   */
  process(list, text, session) {
    if (text.length === 0) {
      session.set('messages', ['Please type some text to add a todo.']);
      return super.process(list, session);
    }
    const items = session.get('items', []);
    items.push({
      id: Uuid.v4(),
      text,
      completed: false
    });
    session.set('items', items);

    // Redirect to the frontpage.
    // We may render the page using super.process() instead, but redirecting
    // is more friendly as it allows us to refresh the page and use the back
    // button without resubmitting the form.
    return this.redirect('/');
  }
}

module.exports = AddRoute;
