/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes map URLs to views and controllers.
 *
 * If Sails receives a URL that doesn't match any of the routes below,
 * it will check for matching files (images, scripts, stylesheets, etc.)
 * in your assets directory.  e.g. `http://localhost:1337/images/foo.jpg`
 * might match an image file: `/assets/images/foo.jpg`
 *
 * Finally, if those don't match either, the default 404 handler is triggered.
 * See `api/responses/notFound.js` to adjust your app's 404 logic.
 *
 * Note: Sails doesn't ACTUALLY serve stuff from `assets`-- the default Gruntfile in Sails copies
 * flat files from `assets` to `.tmp/public`.  This allows you to do things like compile LESS or
 * CoffeeScript for the front-end.
 *
 * For more information on configuring custom routes, check out:
 * http://sailsjs.org/#!/documentation/concepts/Routes/RouteTargetSyntax.html
 */

module.exports.routes = {

  /***************************************************************************
  *                                                                          *
  * Make the view located at `views/homepage.ejs` (or `views/homepage.jade`, *
  * etc. depending on your default view engine) your home page.              *
  *                                                                          *
  * (Alternatively, remove this and add an `index.html` file in your         *
  * `assets` directory)                                                      *
  *                                                                          *
  ***************************************************************************/

  // '/*': {
  //   //view: 'homepage'
  //   //view: 'index',
  //   locals:{layout: false,}, // set to false in case layout not set to false in views.js
  //   controller: 'Content',
  //   action: 'view',
  //   skipAssets: true
  // },

  /***************************************************************************
  *                                                                          *
  * Custom routes here...                                                    *
  *                                                                          *
  * If a request to a URL doesn't match any of the custom routes above, it   *
  * is matched against Sails route blueprints. See `config/blueprints.js`    *
  * for configuration options and examples.                                  *
  *                                                                          *
  ***************************************************************************/

  // '/content/view/:id': {
  //   controller: 'Content',
  //   action: 'view',
  //   skipAssets: false
  // },

  'GET /content/getChildren/:id': {
    controller: 'ContentController',
    action: 'getChildren',
    skipAssets: true,
    //swagger path object
    swagger: {
        methods: ['GET', 'POST'],
        summary: ' Get Children ',
        description: 'Get Children of the current node',
        produces: [
            'application/json'
        ],
        tags: [
            'Children'
        ],
        responses: {
            '200': {
                description: 'List of Children',
                schema: 'Group', // api/model/Group.js,
                type: 'array'
            }
        },
        parameters: []

    }
  },

  'GET /content/getNodeData': {
    controller: 'ContentController',
    action: 'getNodeData',
    skipAssets: true
  },

  'GET /content/getContent/:id': {
    controller: 'ContentController',
    action: 'getContent',
    skipAssets: true
  },

  'GET /content/getParent/:id': {
    controller: 'ContentController',
    action: 'getParent',
    skipAssets: true
  },

  'GET /content/getSiblings/:id': {
    controller: 'ContentController',
    action: 'getSiblings',
    skipAssets: true
  },

  'GET /content/getViewTemplateOverrides': {
    controller: 'ContentController',
    action: 'getViewTemplateOverrides',
    skipAssets: true
  },

  'GET /content/getContentTypeSchema': {
    controller: 'ContentController',
    action: 'getContentTypeSchema',
    skipAssets: true
  },  

  'GET /content/getContentTypes': {
    controller: 'ContentController',
    action: 'getContentTypes',
    skipAssets: true
  },  

  'POST /content/create': {
    controller: 'ContentController',
    action: 'create',
    skipAssets: true
  },  

  'POST /content/update': {
    controller: 'ContentController',
    action: 'update',
    skipAssets: true
  },  

  'POST /content/delete': {
    controller: 'ContentController',
    action: 'delete',
    skipAssets: true
  },  

  'GET /swagger/doc': {
    controller: 'SwaggerController',
    action: 'doc',
    skipAssets: true
  },

  'GET /docs/api': {
    skipAssets: true
  },

  'GET /login': {
       view: 'login'
  },

  'POST /login': 'AuthController.login',

  '/logout': 'AuthController.logout',

  'GET /signup': {
    view: 'signup'
  },

  '/*': {
      //view: 'homepage'
      //view: 'index',
      locals:{layout: false,}, // set to false in case layout not set to false in views.js
      controller: 'ContentController',
      action: 'view',
      skipAssets: true
    },

};
