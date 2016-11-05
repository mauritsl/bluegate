'use strict';

const _ = require('lodash');

/**
 * @Route("GET /clear-completed/<csrfToken:string>")
 * @Query("destination", type="string", default="/")
 * @Csrf(true)
 */
class ClearCompletedRoute {
  /**
   * Create a new route.
   *
   * Register a redirect function in this object.
   * This needs to be done in the constructor because
   * only the constructor has access to the request object.
   */
  constructor(request) {
    this.redirect = target => {
      request.setHeader('Location', target);
      request.status = 303;
      return '';
    };
  }

  /**
   * Process action.
   */
  process(session, destination) {
    let items = session.get('items', []);
    items = _.filter(items, {completed: false});
    session.set('items', items);
    return this.redirect(destination);
  }
}

module.exports = ClearCompletedRoute;
