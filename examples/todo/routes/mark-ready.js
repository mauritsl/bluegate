'use strict';

/**
 * @Route("GET /mark-ready/<id:uuid>/<token:string>/<completed:bool>")
 * @Query("destination", type="string", default="/")
 */
class MarkReadyRoute {
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
  process(id, destination, session, completed) {
    let items = session.get('items', []);
    items = items.map(item => {
      if (item.id === id) {
        item.completed = completed;
      }
      return item;
    });
    session.set('items', items);
    return this.redirect(destination);
  }
}

module.exports = MarkReadyRoute;
