'use strict';

const _ = require('lodash');

/**
 * @Route("GET /clear-completed/<token:string>")
 * @Query("destination", type="string", default="/")
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
   * Validate CSRF token.
   */
  prevalidation(token, csrfToken) {
    if (token !== csrfToken) {
      throw new Error('Invalid CSRF token');
    }
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
