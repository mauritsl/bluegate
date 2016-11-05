'use strict';

/**
 * @Route("GET /mark-ready/<id:uuid>/<csrfToken:string>/<completed:bool>")
 * @Query("destination", type="string", default="/")
 * @Csrf(true)
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
