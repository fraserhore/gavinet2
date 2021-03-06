/**
 * @module          services/ContentService
 * @description     Helpers for managing content
 * @author          Fraser Hore
 * @requires        module:neo4j
 * @help            :: See http://sailsjs.org/#!/documentation/concepts/Services
 */

// Require the neo4j graph database connector
var neo4jBolt = require('neo4j-driver').v1;
var local = require('../../config/local');
var driver = neo4jBolt.driver("bolt://"+local.neo4j.host, neo4jBolt.auth.basic(local.neo4j.user, local.neo4j.password));

var neo4j = require('neo4j');
var local = require('../../config/local');
var db = new neo4j.GraphDatabase({
    url: 'http://'+local.neo4j.host+':'+local.neo4j.port,
    auth: local.neo4j.user+':'+local.neo4j.password
});
var request = require("request");
var fs = require("fs");
//var processFile = "/Fraser/webapps/gavinet/assets/datasets/pmt_top_all.json";
var processFile = "C:/apps/gavinet/assets/datasets/pmt_top_all.json";
var DOMParser = require('xmldom').DOMParser;
var XMLSerializer = require('xmldom').XMLSerializer;

module.exports = {

    //id, lang, versionName, versionValidityDate
    getNodeData: function(options, done) {
        var session = driver.session(),
            query = '',
            urlMatch = '',
            versionMatch = "";

        if(options.versionName) {
            versionMatch = " AND version.name = " + options.versionName;
        } else if(options.versionValidityDate) {
            versionMatch = " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate;
        } else {
            versionMatch = " AND version.to = 9007199254740991";
        }
        //console.log(versionMatch);

        if(options.urlAlias) {
            urlMatch = 'urlAliasVersion.urlAlias = {urlAlias} AND version.lang = {lang}';
        } else {
            urlMatch = 'identityNode.uuid = {id} AND urlAliasVersionRel.to = 9007199254740991 AND version.lang = {lang}';
        }

        for(var property in options) {
            if(options[property] === undefined) {
                options[property] = null;
            }
        }


        query =   'MATCH (urlAliasVersion)<-[urlAliasVersionRel:VERSION]-(urlAliasIdentity)-[:URL_ALIAS]-(identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)'
                +' WHERE ' + urlMatch + versionMatch
                +' WITH identityNode, version, versionNode, authorNode, urlAliasVersion.urlAlias as urlAlias'
                // get the content type schema
                +' OPTIONAL MATCH (identityNode)-[:INSTANCE_OF]->(contentTypeIdentity)-[:VERSION {to:9007199254740991}]->(contentTypeVersion),'
                +' (contentTypeIdentity)-[:PROPERTY|RELATIONSHIP|CONTAINS {to:9007199254740991}]->(propertyIdentity)-[:VERSION {to:9007199254740991}]->(propertyVersion:Version)'
                +' OPTIONAL MATCH (contentTypeIdentity)-[]->(relationshipTypeIdentity:RelationshipType)-[:VERSION {to:9007199254740991}]->(relationsipTypeVersion {type:"relationship"})'
                +' WITH *, collect(relationsipTypeVersion.identifier) as relationshipIdentifiers'
                +' OPTIONAL MATCH (identityNode)-[relationship]->(relatedIdentityNode)-[:VERSION {to:9007199254740991}]->(relatedVersion)'
                +' WHERE toLower(type(relationship)) IN relationshipIdentifiers'
                +' WITH *, reduce(map = [], n IN collect(relatedVersion)| [{referenceNode: identityNode, relationshipName:type(relationship), direction: "outbound", relatedNode: n}]) as relationships'
                +' RETURN identityNode, version, versionNode, relationships, authorNode, urlAlias, contentTypeIdentity, contentTypeVersion, collect(propertyIdentity) as propertyIdentities, collect(propertyVersion) as propertyVersions';
        console.log(query);
        return session
            .run(query, options)
            .then(result => {
                session.close();
                var record = result.records[0],
                    schema = {},
                    contentTypeVersion = record.get('contentTypeVersion');
                if(contentTypeVersion) {
                    var contentTypeVersionProperties = contentTypeVersion.properties,
                        propertyVersions = record.get('propertyVersions');
                    schema = contentTypeVersionProperties;
                    schema["properties"] = {};
                    for (var i = 0; i < propertyVersions.length; i++) {
                        schema.properties[propertyVersions[i].properties.identifier] = propertyVersions[i].properties;
                    };
                }
                return done({
                    'identityNode': record.get('identityNode'), 
                    'version': record.get('version'),
                    'versionNode': record.get('versionNode'),
                    'relationships': record.get('relationships'),
                    'authorNode': record.get('authorNode'),
                    'lang': options.lang,
                    'schema': schema
                });
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });
    },

    /** Get child content objects */
    getContent: function(options, done) {
        var session = driver.session(),
            query,
            versionMatch = "";

        if(options.versionName) {
            versionMatch = " AND version.name = " + options.versionName;
        } else if(options.versionValidityDate) {
            versionMatch = " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate;
        } else {
            versionMatch = " AND version.to = 9007199254740991";
        }
        //console.log(versionMatch);
        var query =   'MATCH (identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)'
                    +' WHERE identityNode.uuid = {id} AND version.lang = {lang}'
                    +  versionMatch
                    +' RETURN identityNode, version, versionNode, authorNode';

        return session
            .run(query, options)
            .then(result => {
                session.close();
                var record = result.records[0];
                return done({
                    'identityNode': record.get('identityNode'), 
                    'version': record.get('version'),
                    'versionNode': record.get('versionNode'),
                    'authorNode': record.get('authorNode')
                });
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });
    },

    /**
     * ContentController.view()
     */
    view: function(options, done) {
        var session = driver.session();
        var view = options.view;
        var params = {
            "id": options.id,
            "lang": options.lang
        };
        // Set the appropriate match query depending on whether request is by validity date, version name, or latest (default)
        // TODO: Add version number
        var versionMatch = "";
        if(options.versionName) {
            versionMatch = " AND version.name = " + options.versionName;
        } else if(options.versionValidityDate) {
            versionMatch = " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate + " AND relatedVersion.from <= " + versionValidityDate + " AND relatedVersion.to >= " + versionValidityDate;
        } else {
            versionMatch = " AND version.to = 9007199254740991 AND relatedVersion.to = 9007199254740991";
        }
        var query =   'MATCH (identityNode)-[version:VERSION]->(versionNode), (identityNode)-[relatedRelationship]-(relatedIdentityNode)-[relatedVersion:VERSION]->(relatedVersionNode), (authorNode)-[created:CREATED]->(identityNode)'
                    +' WHERE identityNode.uuid = {id} AND version.lang = {lang} AND relatedVersion.lang = {lang} AND Not (identityNode)-[relatedRelationship:VERSION|:CREATED|:CONTAINS]-(relatedIdentityNode)'
                    +  versionMatch
                    +' RETURN identityNode, version, versionNode, collect(relatedVersionNode) as relationships, authorNode';
        

        return session
            .run(query, params)
            .then(result => {
                session.close();
                var record = result.records[0];
                var options = {
                    'view': view,
                    'identityNode': record.get('identityNode'), 
                    'version': record.get('version'),
                    'versionNode': record.get('versionNode'),
                    'authorNode': record.get('authorNode')
                };
                ContentService.getViewTemplate(options, function(viewTemplate) {
                    //console.log('viewTemplate: ' + viewTemplate);
                    var props = {};
                    props['app'] = options;
                    props.app['viewTemplate'] = viewTemplate;
                    ContentService.getOverrides(function(viewTemplateOverrides) {
                        props.app['viewTemplateOverrides'] = viewTemplateOverrides;
                        //console.log('props: ' + props.app.viewTemplateOverrides);
                        return done(props);
                    });
                });
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });
    },

    /** Get template override */
    getViewTemplate: function(options, done) {
        var session = driver.session();
        var query =  'MATCH ()-[:CONTAINS {to:9007199254740991}]->(a:Override)-[r:VERSION {to:9007199254740991}]->(b:Version {source:{source}})'
                    +' WHERE b.contentTypeIdentifier = {contentTypeIdentifier} OR b.contentTypeId = {contentTypeId} or toInt(b.identityNodeId) = {identityNodeId}'
                    +' RETURN b as override';
        var params = {
            "source": options.view,
            "contentTypeIdentifier": options.identityNode.properties.contentType || 'folder',
            "contentTypeId": 0,
            "identityNodeId": options.identityNode.properties.uuid

        };
        //console.log(params);
        session
            .run(query, params)
            .then(result => {
                session.close();
                var record = result.records[0];
                if(record) {
                    done(record.override.properties.matchFile);
                } else {
                    done('content-full')
                }
                 
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });
    },

    getOverrides: function(done) {
        var session = driver.session();
        var query =  'MATCH (a:Override)-[r:VERSION {to:9007199254740991}]->(b:Version)'
                    +' RETURN b as Override';
        
        session
            .run(query)
            .then(result => {
                session.close();
                var Overrides = [];
                result.records.forEach(res => {
                    Overrides.push({Override: res.get('Override')});
                })
                return done(Overrides);
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });
    },

    /** Get child content objects */
    getChildren: function(options, done) {
        //console.log(options);
        var session = driver.session();
        var versionMatch = "";
        var contentTypeMatch = options.contentTypes ? " AND identityNode.contentType IN [" + options.contentTypes + "]" : '';

        if(options.versionName) {
            versionMatch = " AND version.versionName = " + "'" + options.versionName + "'";
        } 
        if(options.versionValidityDate) {
            versionMatch += " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate;
        } else {
            versionMatch += " AND parentChildRel.to = 9007199254740991 AND version.to = 9007199254740991";
        }
        var query =   'MATCH (parentNode)-[parentChildRel:CONTAINS]->(identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)'
                    +' WHERE parentNode.uuid = {id} AND version.lang = {lang}'
                    +  versionMatch
                    +  contentTypeMatch
                    +' OPTIONAL MATCH (identityNode)-[:URL_ALIAS]->(urlAliasIdentity)-[urlAliasVersionRel:VERSION {to:9007199254740991}]->(urlAliasVersion)'
                    +' RETURN identityNode, version, versionNode, authorNode, urlAliasVersion.urlAlias as urlAlias ORDER BY parentChildRel.order, parentChildRel.from';
       // console.log(query);
        return session
            .run(query, options)
            .then(result => {
                var children = [];
                result.records.forEach(function(record) {
                    children.push({
                        'identityNode': record.get('identityNode'), 
                        'version': record.get('version'),
                        'versionNode': record.get('versionNode'),
                        'authorNode': record.get('authorNode'),
                        'urlAlias': record.get('urlAlias')
                    });
                });
                session.close();
                //console.log(children);
                return done(children);
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });      
    },

    /** Get related content objects 
    * @param {object} req - HTTP request object
    * @param {object} res - HTTP response object
    * @param {object} req.id - Node ID of the content object for which to get related content objects
    */
    getRelated: function(options, done) {
        var query =  'MATCH (a)-[r]-(identityNode), (identityNode)-[version:VERSION {to:9007199254740991}]->(versionNode)'
                    +' WHERE a.uuid = {id} AND NOT (a)-[r:VERSION|:CREATED|:CONTAINS]->(b) AND NOT (a)<-[r:VERSION|:CREATED|:CONTAINS]-(b)'
                    +' RETURN r as relationship, identityNode, version, versionNode'
        return session
            .run(query, options)
            .then(result => {
                session.close();
                var record = result.records[0];
                return done({
                    'relationship': record.get('relationship'),
                    'identityNode': record.get('identityNode'), 
                    'version': record.get('version'),
                    'versionNode': record.get('versionNode')
                });
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });
    },

    /** Get parent */
    getParent: function(req, res) {

        var query =  'MATCH (identityNode)<-[r:CONTAINS {to:9007199254740991}]-(parentNode)'
                    +' WHERE identityNode.uuid = {id}'
                    +' RETURN parentNode'
        var params = {
            "id": req.param('id')
        };
        var cb = function(err, data) {
            //console.log(data);
            return res.json(data[0]);
        }
        db.cypher({
            query: query,
            params: params
        }, cb);
    },

    /** Get siblings */
    getSiblings: function(options, done) {
        var session = driver.session();
        var query =  ' MATCH (identityNode)<-[r:CONTAINS]-(parent)'
                    +' WHERE identityNode.uuid = {id} AND r.to = 9007199254740991'
                    +' WITH parent'
                    +' MATCH (parent)-[parentChildRel:CONTAINS]->(siblingNode)-[:URL_ALIAS]->(urlAliasIdentity)-[urlAliasVersionRel:VERSION]->(urlAliasVersion)'
                    +' WHERE parentChildRel.to = 9007199254740991 AND urlAliasVersionRel.to = 9007199254740991'
                    +' RETURN siblingNode, urlAliasVersion.urlAlias as urlAlias';
        return session
            .run(query, options)
            .then(result => {
                var siblings = [];
                result.records.forEach(function(record) {
                    siblings.push({
                        'siblingNode': record.get('siblingNode'), 
                        'urlAlias': record.get('urlAlias')
                    });
                });
                session.close();
                return done(siblings);
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });        
    },

    /** Get content types */
    getContentTypes: function(options, done) {
        var session = driver.session();
        var query =  'MATCH (a:ContentType)-[:VERSION {to:9007199254740991}]->(b:Version)'
                    +' RETURN a as contentTypeIdentity, b as contentTypeVersion';

        return session
            .run(query, options)
            .then(result => {
                var contentTypes = [];
                result.records.forEach(function(record) {
                    contentTypes.push({
                        'contentTypeIdentity': record.get('contentTypeIdentity'), 
                        'contentTypeVersion': record.get('contentTypeVersion')
                    });
                });
                session.close();
                return done(contentTypes);
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });
    },

    /** Get content type schema */
    getContentTypeSchema: function(options, done) {
        var session = driver.session();
        // ct = contentType, I = identity, V = version, R = relationship, prop = property, cProp = complex property
        var query =   'MATCH (ctI:ContentType)-[ctVR:VERSION {to:9007199254740991}]->(ctV:Version {identifier:{contentType}})'
                    +' MATCH (ctI)-[propR:PROPERTY|RELATIONSHIP|CONTAINS {to:9007199254740991}]->(propI)-[propVR:VERSION {to:9007199254740991}]->(propV:Version)'
                    +' MATCH (ctI)-[:INSTANCE_OF]->(instanceType)-[:VERSION {to:9007199254740991}]->(instanceV:Version)'
                    +' OPTIONAL MATCH (ctI)-[:URL_ALIAS]->(ctIurlAliasI)'
                    +' OPTIONAL MATCH (propI)-[:ENUM_ITEMS_PARENT]->(enumItemsParent)'
                    +' OPTIONAL MATCH (propI)-[:ENUM_ITEM]->(enumItem)'
                    +' OPTIONAL MATCH (propI)-[cPropR:PROPERTY|RELATIONSHIP|CONTAINS {to:9007199254740991}]->(cPropI)-[cPropVR:VERSION {to:9007199254740991}]->(cPropV:Version)'
                    +' OPTIONAL MATCH (cPropI)-[:ENUM_ITEMS_PARENT]->(cPropEnumItemsParent)'
                    +' OPTIONAL MATCH (cPropI)-[:ENUM_ITEM]->(cPropEnumItem)'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, propV, propR, enumItemsParent, enumItem, cPropR, cPropI, cPropV, cPropEnumItemsParent, cPropEnumItem, {} as cPropObject, cPropV {.*, order: cPropR.order, enumItemsParent: cPropEnumItemsParent.uuid, enumItems: collect(cPropEnumItem.uuid)} as cPropObject2 ORDER BY cPropR.order'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, propV, propR, enumItemsParent, enumItem, cPropI, cPropV, cPropEnumItemsParent, cPropEnumItem, apoc.map.setKey(cPropObject, cPropV.identifier, cPropObject2) as cPropObject3'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, propV, propR, enumItemsParent, enumItem, reduce(s = {}, x IN collect(cPropObject3) | apoc.map.merge(s, x)) as cPropProperties'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, propV, propR, enumItemsParent, enumItem, propV {.*, properties: cPropProperties} as propV2'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, propV2, propR, {} as object, propV2 {.*, order: propR.order, enumItemsParent: enumItemsParent.uuid, enumItems: collect(enumItem.uuid)} as object2 ORDER BY propR.order'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, apoc.map.setKey(object, propV2.identifier, object2) as object3'
                    +' WITH ctI, ctVR, ctV, ctIurlAliasI, reduce(s = {}, x IN collect(object3) | apoc.map.merge(s, x)) as properties'
                    +' WITH ctV {.*, uuid: ctI.uuid, type: "object", urlAlias: ctIurlAliasI.name, versionNumber: ctVR.versionNumber, versionName: ctVR.versionName, validFrom: ctVR.from, validTo: ctVR.to, properties: properties} as contentType'
                    +' RETURN contentType';
        return session
            .run(query, options)
            .then(result => {
                var record = result.records[0];
                if(!record) return;

                //console.log(record);

                var contentType = record.get('contentType');
                //console.log(contentType);
                session.close();
                return done(contentType);
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });        
    },

    /**
     * Create new content object (identityNode and versionNode)
     */
    create: function(options, done) {
        var session = driver.session();
        var properties = options.properties,
            relationships = options.relationships,
            relationshipsStatement = '',
            versionName = options.versionName || "initial";
        if(relationships.length) {
            var matchRelated = ' MATCH ',
                whereRelated = ' WHERE ',
                createRelationships = '';
            for (var i = relationships.length - 1; i >= 0; i--) {
               //console.log(relationships[i]);
                var relationshipName = relationships[i].relationshipName.toUpperCase(),
                    direction = relationships[i].direction,
                    inboundSymbol = direction === 'inbound' ? '<' : '',
                    outboundSymbol = direction === 'outbound' ? '>' : '',
                    relatedNode = relationships[i].relatedNode,
                    relatedNodeId = relatedNode.properties.uuid,
                    relatedIdentifier = 'node' + relatedNodeId.replace(/-/g, '');
                
                matchRelated += '(' + relatedIdentifier + ')';
                whereRelated += relatedIdentifier + '.uuid = "' + relatedNodeId + '"';
                if(i) {
                    matchRelated += ', ';
                    whereRelated += ', ';
                } 
                createRelationships += ' CREATE (childidentity)' + inboundSymbol + '-[:' + relationshipName + ' {from:timestamp(), to:9007199254740991}]-' + outboundSymbol + '(' + relatedIdentifier + ')';
                //console.log(matchRelated);
            };
            relationshipsStatement = ' WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author' 
                                     + matchRelated
                                     + whereRelated 
                                     + createRelationships;
        }
        console.log(options);
        var query =  // Match path from root to parent so we can use it later to create the URL alias.
					 ' MATCH p = (a:Root)-[:CONTAINS*]->(parent)'
					// Match on parent uuid and author uuid
                    +' WHERE parent.uuid = {parentId}'
                    // Create new identity and version
                    +' CREATE (parent)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{versionName}}]->'
                    +       '(childidentity:Identity:ContentObject {contentType:{contenttype}})'
                    +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{versionName}, lang:{lang}}]->'
                    +       '(childversion:Version)'
                    // Create URL alias identity and version
                    +' CREATE (childidentity)-[:URL_ALIAS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{versionName}}]->'
                    +       '(urlAliasIdentity:Identity:UrlAlias {contentType:"urlAlias"})'
                    +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{versionName}, lang:{lang}}]->'
                    +       '(urlAliasVersion:Version)'
                    // Set properties
                    +' SET childidentity:' + ContentService.pascalize(options.contenttype) 
                    +' SET childversion = {properties}'
                    +' SET childidentity.name = ' + options.identityNamePattern

                    +' WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, reduce(urlAlias = "", n IN nodes(p)| urlAlias + "/" + replace(n.name," ", "-") + "/" + replace(childversion.name," ", "-")) AS urlAlias'
                    +' MATCH (author)'
                    +' WHERE author.uuid = {authorId}'
                    // Create relationshps from author to identity nodes and version nodes
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)'
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)'
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasIdentity)'
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasVersion)'
                    // Set URL Alias
                    +' SET urlAliasIdentity.name = urlAlias'
                    +' SET urlAliasVersion.urlAlias = urlAlias'
                    // Set uuids
                    +' WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author'
                    +' CALL apoc.create.uuids(4) YIELD uuid'
                    +' WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author, collect(uuid) as uuids'
                    +' SET childidentity.uuid = uuids[0]'
                    +' SET childversion.uuid = uuids[1]'
                    +' SET urlAliasIdentity.uuid = uuids[2]'
                    +' SET urlAliasVersion.uuid = uuids[3]'

                    // Create relationships if there are any
                    +  relationshipsStatement

                    // Create relationship to content type
                    +' WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author'
                    +' MATCH (contentType:ContentType)-[:VERSION {to:9007199254740991}]->(contentTypeVersion)'
                    +' WHERE contentTypeVersion.identifier = {contenttype}'
                    +' CREATE (childidentity)-[:INSTANCE_OF]->(contentType)'

                    // Return results
                    +' RETURN parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author';
       //console.log(options);
        return session
            .run(query, options)
            .then(result => {
                session.close();
               //console.log(result);
                var record = result.records[0];
                //console.log(record.get('childidentity'));
                //console.log(record.get('childversion'));
                return done({
                    'parent': record.get('parent'),
                    'identityNode': record.get('childidentity'), 
                    'versionNode': record.get('childversion'),
                    'authorNode': record.get('author'),
                    'urlAliasIdentity': record.get('urlAliasIdentity'),
                    'urlAliasVersion': record.get('urlAliasVersion')
                });
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });
    },

    /**
     * Create new relationship
     */
    createRelationship: function(req, res) {
        //console.log(req.body);
        var query =   'MATCH (from), (to)'
                    +' WHERE id(from)={fromId} AND id(to)={toId}'
                    +' CREATE from-[r:' 
                    + req.body.relationshipName.split(' ').join('_').toUpperCase()
                    + ' {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{versionName}}]->to'
                    +' RETURN from, r, to';
        var params = {
            "fromId": req.body.direction === 'Inbound' ? parseInt(req.body.relatedNodeId) : parseInt(req.body.referenceNodeId),
            "relationshipName": req.body.relationshipName.split(' ').join('_').toUpperCase(),
            "toId": req.body.direction === 'Outbound' ? parseInt(req.body.relatedNodeId) : parseInt(req.body.referenceNodeId)
        };
        var cb = function(err, data) {
            //console.log(err);
            //console.log(data);
            return res.json(data);
        };
        db.cypher({
            query: query, 
            params: params
        }, cb);
    },

    /**
    * update content object (new versionNode)
    */
    update: function(options, done) {
        var session = driver.session();
        var properties = options.properties,
            relationships = options.relationships
            relationshipsStatement = '';
        
        if(relationships.length) {
            var matchRelated = ' MATCH ',
                whereRelated = ' WHERE ',
                createRelationships = '';
            for (var i = relationships.length - 1; i >= 0; i--) {
               console.log(relationships[i]);
                var relationshipName = relationships[i].relationshipName.toUpperCase(),
                    direction = relationships[i].direction,
                    inboundSymbol = direction === 'inbound' ? '<' : '',
                    outboundSymbol = direction === 'outbound' ? '>' : '',
                    relatedNode = relationships[i].relatedNode,
                    relatedNodeId = relatedNode.properties.uuid,
                    relatedIdentifier = 'node' + relatedNodeId.replace(/-/g, '');   
                matchRelated += '(' + relatedIdentifier + ')';
                whereRelated += relatedIdentifier + '.uuid = "' + relatedNodeId + '"';
                if(i) {
                    matchRelated += ', ';
                    whereRelated += ' AND ';
                } 
                createRelationships += ' CREATE (identitynode)' + inboundSymbol + '-[:' + relationshipName + ' {from:timestamp(), to:9007199254740991}]-' + outboundSymbol + '(' + relatedIdentifier + ')';
            };
            relationshipsStatement = ' WITH identitynode, currentversion, newversion, urlAliasIdentity, newUrlAliasVersion, author' 
                                     + matchRelated
                                     + whereRelated 
                                     + createRelationships;
        }
        //console.log(options);
        var query = // UPDATE (CONTENT) - Add a Version node
                      ' MATCH (identitynode)-[currentversionrelationship:VERSION {to:9007199254740991}]->(currentversion)'
                    + ' WHERE identitynode.uuid = {id} AND currentversionrelationship.lang = {lang}'
                    // Update the current version relationship to end validity
                    + ' SET currentversionrelationship.to = timestamp()'
                    // Create the new version relationship and node
                    + ' CREATE (identitynode)-[newversionrelationship:VERSION {from:timestamp(), to:9007199254740991}]->(newversion:Version)'
                    // Set new version relationship properties
                    + ' SET newversionrelationship.versionNumber = toInt(currentversionrelationship.versionNumber) + 1'
                    + ' SET newversionrelationship.versionName = {versionName}'
                    + ' SET newversionrelationship.lang = currentversionrelationship.lang'
                    // Set new version node properties
                    + ' SET newversion = {properties}'
                    //... update more newversion properties
                    // Update the identity node
                    + ' SET identitynode.name = ' + options.identityNamePattern
                    // Create a previous relationship from the new version to the previous version
                    + ' CREATE (newversion)-[:PREVIOUS]->(currentversion)'
                    // Create new URL alias version
                    // Match path from root to parent so we can use it later to create the URL alias.
                    +' WITH identitynode, currentversion, newversion'
                    +' MATCH p = (a:Root)-[:CONTAINS*]->(identitynode)'
                    +' MATCH (identitynode)-[:URL_ALIAS {to:9007199254740991}]->(urlAliasIdentity:Identity:UrlAlias)'
                    +       '-[currentUrlAliasVersionRelationship:VERSION {to:9007199254740991}]->(currentUrlAliasVersion:Version)'
                    +' SET currentUrlAliasVersionRelationship.to = timestamp()'
                    +' MERGE (urlAliasIdentity)-[newUrlAliasVersionRelationship:VERSION {from:timestamp(), to:9007199254740991, lang:{lang}}]->(newUrlAliasVersion:Version)'
                    +' SET newUrlAliasVersionRelationship.versionNumber = toInt(currentUrlAliasVersionRelationship.versionNumber) + 1'
                    +' CREATE (newUrlAliasVersion)-[:PREVIOUS]->(currentUrlAliasVersion)'
                    +' WITH identitynode, currentversion, newversion, urlAliasIdentity, newUrlAliasVersion, reduce(urlAlias = "", n IN nodes(p)| urlAlias + "/" + replace(n.name," ", "-") + "/" + replace(newversion.name," ", "-")) AS urlAlias'
                    +' MATCH (author)'
                    +' WHERE author.uuid = {authorId}'
                    // Create relationshps from author to version nodes
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(newversion)'
                    +' CREATE (author)-[:CREATED {timestamp:timestamp()}]->(newUrlAliasVersion)'
                    // Set URL Alias
                    +' SET urlAliasIdentity.name = urlAlias'
                    +' SET newUrlAliasVersion.urlAlias = urlAlias'
                    // Set uuids
                    +' WITH identitynode, currentversion, newversion, urlAliasIdentity, newUrlAliasVersion, author'
                    +' CALL apoc.create.uuids(2) YIELD uuid'
                    +' WITH identitynode, currentversion, newversion, urlAliasIdentity, newUrlAliasVersion, author, collect(uuid) as uuids'
                    +' SET newversion.uuid = uuids[0]'
                    +' SET newUrlAliasVersion.uuid = uuids[1]'
                    // Create relationships if there are any
                    +  relationshipsStatement
                    // Return results
                    +' RETURN identitynode, currentversion, newversion, urlAliasIdentity, newUrlAliasVersion, author';

        //console.log(query);
        return session
            .run(query, options)
            .then(result => {
                session.close();
                var record = result.records[0];
               //console.log(record.get('newversion'));
                return done({
                    'identityNode': record.get('identitynode'), 
                    'versionNode': record.get('newversion'),
                    'authorNode': record.get('author'),
                    'urlAliasIdentity': record.get('urlAliasIdentity'),
                    'urlAliasVersion': record.get('newUrlAliasVersion')
                });
            })
            .catch(error => {
                session.close();
               //console.log(error);
                return done(error);
                throw error;
            });
    },

    /**
     * Delete a content object (end version validity)
     */
    delete: function(req, res) {

        var query =  'MATCH (child)<-[relationship:CONTAINS {to:9007199254740991}]-(parent)'
                    +' WHERE child.uuid = {id}'
                    +' SET relationship.to = timestamp()'
                    +' RETURN parent, child';
        var params = {
            "id": req.param('id')
        };
        
        var cb = function(err, data) {
           //console.log(err);
           //console.log("delete: "+req.param('id'));
           //console.log(data);
            return res.json(data);
        };
        db.cypher({
            query: query, 
            params: params
        }, cb);
    },

    /** Move a content object (end validity of old location relationship and create new location relationship) */
    // {
    //     "id": req.body.id,
    //     "parentId": req.body.parentId,
    //     "newParentId": req.body.newParentId,
    //     "authorId": req.body.authorId
    // };
    move: function(options, done) {

    },

    /** Add content object to an additional location (create new location relationship) */
    addLocation: function(req, res) {

    },



    /** Get child content objects */
    getProcess: function(req, res) {
        var params = {
            "id": req.param('id'),
            "lang": req.param('lang') || "en-gb"
        };
        var versionMatch = "";

        if(req.param('versionName')) {
            var versionName = req.param('versionName');
            versionMatch = " AND versionRel.versionName = " + versionName + " AND mxCellVersionRel.versionName = " + versionName;
        } else if(req.param('versionValidityDate')) {
            var versionValidityDate = parseInt(req.param('versionValidityDate'));
            versionMatch = " AND versionRel.from <= " + versionValidityDate + " AND versionRel.to >= " + versionValidityDate + " AND mxCellVersionRel.from <= " + versionValidityDate + " AND mxCellVersionRel.to >= " + versionValidityDate;
        } else {
            versionMatch = " AND parentChildRel.to = 9007199254740991 AND versionRel.to = 9007199254740991 AND mxCellParentChildRel.to = 9007199254740991 AND mxCellVersionRel.to = 9007199254740991";
        }
        var query =   'MATCH (parentNode)-[parentChildRel:CONTAINS]->(identityNode)-[versionRel:VERSION]->(versionNode), (authorNode)-[createdRel:CREATED]->(identityNode)'
                    +' MATCH (parentNode)-[mxCellParentChildRel:CONTAINS]->(mxCellIdentityNode:MxCell)<-[:HAS_MXCELL]-(identityNode)'
                    +' MATCH (mxCellIdentityNode)-[mxCellVersionRel:VERSION]->(mxCellVersionNode)'
                    +' WHERE parentNode.uuid = {id} AND versionRel.lang = {lang}'
                    +  versionMatch
                    +' RETURN '
                    +' {'
                    +' id: id(parentNode),'
                    +' name: parentNode.name,'
                    +' contentType: parentNode.contentType,'
                    +' children: collect({'
                    +'     id: id(identityNode),'
                    +'     name: identityNode.name,'
                    +'     contentType: identityNode.contentType,'
                    +'     properties: versionNode,'
                    +'     mxCell: {'
                    +'         id: id(mxCellIdentityNode),'
                    +'         name: mxCellIdentityNode.name,'
                    +'         properties: mxCellVersionNode'
                    +'     }'
                    +' })'
                    +' } AS result';
       //console.log(query);
        var cb = function(err, data) {
            if(err) {
               //console.log(err);
            } else if(data[0]) {
               //console.log(data[0].result.children);
                return res.json(data[0].result.children);
            }
        };
        db.cypher({
            query: query,
            params: params
        }, cb);
    },

    /**
     * Create new content object (identityNode and versionNode)
     */
    uploadProcessData: function(req, res) {

        fs.readFile(processFile, (err, file) => {
          
          if (err) throw err;

            var data = JSON.parse(file).d.results; // 1690

            for (var i = 0; i < data.length; i++) {

                if(data[i].ID !==97) {
                    continue;
                } else {
                   //console.log(data[i].ID);
                }

                var contentType = data[i].ContentType.Name.toLowerCase();
                var params = {
                    "parentId": 138,
                    "authorId": 126,
                    "contenttype": contentType
                };

                delete data[i].__proto__;
                delete data[i].ContentType;
                delete data[i].ContentTypeId;
                delete data[i].__metadata;

                params['properties'] = data[i];

                var query =   'MATCH (parent), (author)'
                            +' WHERE id(parent)={parentId} AND id(author)={authorId}'
                            +' MERGE parent-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                            +       '(childidentity:Identity:ContentObject {contentType:{contenttype}})'
                            +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"en-gb"}]->'
                            +       '(childversion:Version)'
                            +' MERGE author-[:CREATED {timestamp:timestamp()}]->childidentity'
                            +' MERGE author-[:CREATED {timestamp:timestamp()}]->childversion'
                            +' SET childidentity:' + contentType.charAt(0).toUpperCase() + contentType.slice(1) 
                            +' SET childversion = {properties}'
                            +' SET childidentity.name = childversion.Title'
                            +' SET childidentity.spId = childversion.Id'
                            +' SET childidentity.spID = childversion.ID'
                            +' SET childidentity.spParentIDs = childversion.ParentIDs'
                            +' RETURN parent,childidentity,childversion';
               //console.log(query);
                var cb = function(error, cypherData) {
                    if (error) {
                       //console.log(error);
                    } else {
                       //console.log(cypherData);
                        //return res.json(cypherData);
                    }
                    
                    
                };

                // db.cypher({
                //     query: query, 
                //     params: params
                // }, cb);

            };
        }); // fs
    },

    uploadMissingXmlElements: function(req, res) {
        // Add Graph Data
        fs.readFile(processFile, (err, file) => {

            if (err) throw err;

            var data = JSON.parse(file).d.results; // 1690
            var count = data.length;
            var delay = 0;

            // Iterate through the data items with a delay
            (function theLoop(i) {
                setTimeout(function() {
                   //console.log(delay);
                   //console.log(i);
                    // START OF CODE TO EXECUTE AFTER EACH DELAY

                    if (data[i].GraphXML) {
                        delay = 5000;
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(data[i].GraphXML, "text/xml");
                        var i2;
                        var geometry = {};
                        var elements = doc.documentElement.childNodes[0].childNodes;
                        for (i2 = 0; i2 < elements.length; i2++) {
                            var name = elements[i2].nodeName;
                            // Add Missing Elemenents (e.g. connectors)
                            if (name === 'Connector' || name === 'OffPageReference') {
                                var attributes = elements[i2].attributes;
                                var mxcell = elements[i2].childNodes[0];
                                var properties = {};
                                for (var i3 = 0; i3 < attributes.length; i3++) {
                                    properties[attributes[i3].nodeName] = attributes[i3].nodeValue;
                                };
                                if (name === 'Connector'){
                                    for (var i4 = 0; i4 < mxcell.attributes.length; i4++) {
                                        properties[mxcell.attributes[i4].nodeName] = mxcell.attributes[i4].nodeValue;
                                    };
                                }
                                var oSerializer = new XMLSerializer();
                                var sXML = oSerializer.serializeToString(mxcell);
                                properties['mxcell'] = sXML;
                                var params = {
                                    "processSpId": parseInt(data[i].Id),
                                    "elementMxId": properties.id,
                                    "authorId": 126,
                                    "contenttype": name.toLowerCase(),
                                    "properties": properties
                                };
                                //console.log(params);
                                var query =   'MATCH (author)'
                                            +' WHERE id(author) = {authorId}'
                                            +' WITH author'
                                            +' MATCH (process:Identity)'
                                            +' WHERE process.spId={processSpId}'
                                            +' WITH author, process'
                                            +' MERGE (process)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                                            +       '(childidentity:Identity:ContentObject {contentType:{contenttype}, mxId:{elementMxId}})'
                                            +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"en-gb"}]->'
                                            +       '(childversion:Version)'
                                            +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)'
                                            +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)'
                                            +' SET childidentity:' + name
                                            +' SET childversion = {properties}'
                                            +' SET childidentity.name = childversion.label'
                                            +' RETURN author,process,childidentity,childversion';
                                //console.log(query);
                                var cb = function(error, cypherData) {
                                    if (error) {
                                       //console.log(error);
                                    } else {
                                       //console.log('Cypher results');
                                       //console.log(cypherData);
                                        //return res.json(cypherData);
                                    }
                                };

                                // db.cypher({
                                //     query: query, 
                                //     params: params
                                // }, cb);
                            }
                        }
                    } else {
                        delay = 0;
                    }

                    // END OF CODE TO EXECUTE AFTER EACH DELAY
                    // If i > 0, keep going
                    if (--i) { 
                        theLoop(i); // Call the loop again
                    }
                }, delay);
            })(count-1);
        }); // fs
    },

    uploadMxCell: function(req, res) {
        // Add Graph Data
        fs.readFile(processFile, (err, file) => {

            if (err) throw err;

            var data = JSON.parse(file).d.results; // 1690
            var count = data.length;
            var delay = 0;

            // Iterate through the data items with a delay
            (function theLoop(i) {
                setTimeout(function() {
                   //console.log(delay);
                   //console.log(i);
                    // START OF CODE TO EXECUTE AFTER EACH DELAY

                    if (data[i].GraphXML) {
                        delay = 5000;
                        var parser = new DOMParser();
                        var doc = parser.parseFromString(data[i].GraphXML, "text/xml");
                        var i2;
                        var geometry = {};
                        var elements = doc.documentElement.childNodes[0].childNodes;

                        for (i2 = 0; i2 < elements.length; i2++) {
                            var name = elements[i2].nodeName;
                            // Add Geometry
                            if (elements[i2].childNodes) {
                                if (elements[i2].childNodes[0].nodeName === 'mxCell') {
                                    var mxCell = elements[i2].childNodes[0];
                                    var oSerializer = new XMLSerializer();
                                    var sXML = oSerializer.serializeToString(mxCell);
                                    var properties = {};

                                    properties['processSpId'] = parseInt(data[i].Id);
                                    properties['elementSpId'] = parseInt(elements[i2].getAttribute('spId') ? elements[i2].getAttribute('spId') : elements[i2].getAttribute('spID'));
                                    properties['elementMxId'] = elements[i2].getAttribute('id');
                                    properties['elementName'] = elements[i2].getAttribute('label');
                                    properties['xml'] = sXML;
                                   
                                    var params = {
                                        "processSpId": properties.processSpId,
                                        "elementSpId": properties.elementSpId,
                                        "elementMxId": properties.elementMxId,
                                        "authorId": 126,
                                        "contenttype": 'mxCell',
                                        "properties": properties
                                    };
                                    //console.log(params);
                                    var query =   'MATCH (author), (process:Identity), (element:Identity)'
                                                +' WHERE id(author) = {authorId} AND process.spId={processSpId} AND (element.spId = {elementSpId} OR element.MxId = {elementMxId})'
                                                +' MERGE (process)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                                                +       '(childidentity:Identity:ContentObject:MxCell {contentType:{contenttype}})'
                                                +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"en-gb"}]->'
                                                +       '(childversion:Version)'
                                                +' MERGE (element)-[:HAS_MXCELL {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(childidentity)'
                                                +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)'
                                                +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)'
                                                +' SET childversion = {properties}'
                                                +' SET childidentity.name = "mxCell"'
                                                +' SET childidentity.processSpId = {processSpId}'
                                                +' SET childidentity.elementSpId = {elementSpId}'
                                                +' SET childidentity.elementMxId = {elementMxId}'
                                                +' RETURN childversion.xml';
                                    //console.log(query);
                                    var cb = function(error, cypherData) {
                                        if (error) {
                                            if(error.code === 'ECONNREFUSED') {
                                               //console.log('ECONNREFUSED Caught');     
                                            }
                                           //console.log(error);
                                        } else {
                                           //console.log('Cypher results');
                                           //console.log(cypherData);
                                            //return res.json(cypherData);
                                        }
                                    };

                                    // db.cypher({
                                    //     query: query, 
                                    //     params: params
                                    // }, cb);

                                }
                            }
                        }

                    } else {
                        delay = 0;
                    }

                    // END OF CODE TO EXECUTE AFTER EACH DELAY
                    // If i > 0, keep going
                    if (--i) { 
                        theLoop(i); // Call the loop again
                    }
                }, delay);
            })(count-1);
            

        }); // fs
    },

    uploadGeometry: function(req, res) {
        // Add Graph Data
        fs.readFile(processFile, (err, file) => {

            if (err) throw err;

            var data = JSON.parse(file).d.results; // 1690

            for (var i = 0; i < 5; i++) {
                if (data[i].GraphXML) {
                    var parser = new DOMParser();
                    var doc = parser.parseFromString(data[i].GraphXML, "text/xml");
                    var i2;
                    var geometry = {};
                    var elements = doc.documentElement.childNodes[0].childNodes;
                    for (i2 = 0; i2 < elements.length; i2++) {
                        var name = elements[i2].nodeName;
                        // Add Geometry
                        if (elements[i2].childNodes) {
                            if (elements[i2].childNodes[0].childNodes[0]) {
                                if (elements[i2].childNodes[0].childNodes[0].nodeName === 'mxGeometry') {
                                    var geometryNode = elements[i2].childNodes[0].childNodes[0];
                                    var points = [];
                                    if(geometryNode.childNodes[0]) {
                                        if(geometryNode.childNodes[0].nodeName === 'Array') {
                                            if(geometryNode.childNodes[0].childNodes[0]) {
                                                var pointNodes = geometryNode.childNodes[0].childNodes;
                                                for (var i4 = 0; i4 < pointNodes.length; i4++) {
                                                    var pointNode = pointNodes[i4];
                                                    var pointNodeAttributes = pointNode.attributes;
                                                    var pointProperties = {};
                                                    for (var i5 = 0; i5 < pointNodeAttributes.length; i5++) {
                                                        pointProperties[pointNodeAttributes[i5].nodeName] = pointNodeAttributes[i5].nodeValue;
                                                    };
                                                };
                                                points.push(pointProperties);
                                            }
                                        }
                                    }
                                    geometry['processSpId'] = parseInt(data[i].Id);
                                    geometry['elementSpId'] = parseInt(elements[i2].getAttribute('spId') ? elements[i2].getAttribute('spId') : elements[i2].getAttribute('spID'));
                                    geometry['elementMxId'] = elements[i2].getAttribute('id');
                                    geometry['elementName'] = elements[i2].getAttribute('label');
                                    geometry['width'] = parseInt(geometryNode.getAttribute('width'));
                                    geometry['height'] = parseInt(geometryNode.getAttribute('height'));
                                    geometry['x'] = parseInt(geometryNode.getAttribute('x'));
                                    geometry['y'] = parseInt(geometryNode.getAttribute('y'));
                                    geometry['points'] = JSON.stringify(points);

                                    var oSerializer = new XMLSerializer();
                                    var sXML = oSerializer.serializeToString(geometryNode);
                                    geometry['xml'] = sXML;

                                    //console.log(geometry);

                                    var params = {
                                        "processSpId": geometry.processSpId,
                                        "elementSpId": geometry.elementSpId,
                                        "elementMxId": geometry.elementMxId,
                                        "authorId": 126,
                                        "contenttype": 'geometry',
                                        "properties": geometry
                                    };
                                    //console.log(params);
                                    var query =   'MATCH (author)'
                                                +' WHERE id(author) = {authorId}'
                                                +' WITH author'
                                                +' MATCH (process:Identity)'
                                                +' WHERE process.spId={processSpId}'
                                                +' WITH author, process'
                                                +' MATCH (element:Identity)'
                                                +' WHERE element.spId = {elementSpId} OR element.MxId = {elementMxId}'
                                                +' MERGE (process)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                                                +       '(childidentity:Identity:ContentObject:Geometry {contentType:{contenttype}})'
                                                +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"en-gb"}]->'
                                                +       '(childversion:Version)'
                                                +' MERGE (element)-[:GEOMETRY {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(childidentity)'
                                                +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)'
                                                +' MERGE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)'
                                                +' SET childversion = {properties}'
                                                +' SET childidentity.name = "Geometry"'
                                                +' RETURN childversion.xml';
                                    //console.log(query);
                                    var cb = function(error, cypherData) {
                                        if (error) {
                                           //console.log(error);
                                        } else {
                                           //console.log('Cypher results');
                                           //console.log(cypherData);
                                            //return res.json(cypherData);
                                        }
                                    };

                                    db.cypher({
                                        query: query, 
                                        params: params
                                    }, cb);

                                }
                            }
                        }
                    }
                }
            }
        }); // fs
    },

	/** Create a branch */
    // {
    //     "parentId" : "uuid",
    //     "currentVersionName" : "versionName",
    //     "versionValidityDate" : "timestamp",
    //     "newVersionName" : "versionName",
    //     "lang" : "en-gb",
    //     "authorId" : "authorI    d"
    // }
    createBranch: function(options, done) {
        var session = driver.session();
        
        var query =   'MATCH (b)-[r2:CONTAINS]->(c)-[r3:VERSION]->(d:Version) '
					+ 'WHERE b.uuid = {parentId} ' 
					+ 'AND r3.from <= {versionValidityDate} AND r3.to >= {versionValidityDate} '
					+ 'AND r3.versionName = {currentVersionName} AND r3.lang = {lang} ' 
					+ 'CREATE (c)-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{newVersionName}, lang:{lang}}]->(d) '
					+ 'WITH b LIMIT 1 '
					+ 'MATCH (b)-[r1:VERSION]->(a:Version) '
					+ 'WHERE r1.from <= 1489705672990 AND r1.to >= 1489705672990 '
					+ 'AND r1.versionName = {currentVersionName} AND r1.lang = {lang} '
					+ 'CREATE (b)-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{newVersionName}, lang:{lang}}]->(a) '
					+ 'RETURN a,b'
      // console.log(options);
      // console.log(query);
        return session
            .run(query, options)
            .then(result => {
                var options2 = {
                    "parentId": options.parentId,
                    "authorId": options.authorId,
                    "contenttype": "branch",
                    "lang": options.lang,
                    "properties": {"name" : options.newVersionName},
                    "relationships": [],
                    "versionName": "initial",
                    "identityNamePattern": "childversion.name"
                };
                session.close();
                return done( ContentService.create(options2, function(done2){return res.json(done2)}) );
            })
            .catch(error => {
                session.close();
               console.log(error);
                return done(error);
                throw error;
            });      
    },

    /** Replace a branch */
    // {
    //     "parentId" : "uuid",
    //     "currentVersionName" : "versionName",
    //     "versionValidityDate" : "timestamp",
    //     "newVersionName" : "versionName",
    //     "lang" : "en-gb",
    //     "authorId" : "authorI    d"
    // }
    replaceBranch: function(options, done) {
        var session = driver.session();
        
        var query =   'MATCH (b)-[r2:CONTAINS]->(c)-[r3:VERSION]->(d:Version) '
                    + 'WHERE b.uuid = {parentId} ' 
                    + 'AND r3.from <= {versionValidityDate} AND r3.to >= {versionValidityDate} '
                    + 'AND r3.versionName = {currentVersionName} AND r3.lang = {lang} ' 
                    + 'CREATE (c)-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{newVersionName}, lang:{lang}}]->(d) '
                    + 'WITH b LIMIT 1 '
                    + 'MATCH (b)-[r1:VERSION]->(a:Version) '
                    + 'WHERE r1.from <= 1489705672990 AND r1.to >= 1489705672990 '
                    + 'AND r1.versionName = {currentVersionName} AND r1.lang = {lang} '
                    + 'CREATE (b)-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:{newVersionName}, lang:{lang}}]->(a) '
                    + 'RETURN a,b'
      // console.log(options);
      // console.log(query);
        return session
            .run(query, options)
            .then(result => {
                var options2 = {
                    "parentId": options.parentId,
                    "authorId": options.authorId,
                    "contenttype": "branch",
                    "lang": options.lang,
                    "properties": {"name" : options.newVersionName},
                    "relationships": [],
                    "versionName": "initial",
                    "identityNamePattern": "childversion.name"
                };
                session.close();
                return done( ContentService.create(options2, function(done2){return res.json(done2)}) );
            })
            .catch(error => {
                session.close();
               console.log(error);
                return done(error);
                throw error;
            });      
    },

    /** Create a snapshot */
    createSnapshot: function(options, done) {
        var options2 = {
            "parentId": options.parentId,
            "authorId": options.authorId,
            "contenttype": "snapshot",
            "lang": options.lang,
            "properties": {
                "name": options.snapshotName,
                "versionValidityDate": options.versionValidityDate,
                "versionName": options.versionName,
                "lang": options.lang
            },
            "relationships": [],
            "versionName": "initial",
            "identityNamePattern": "childversion.name"
        };
        return done( ContentService.create(options2, function(done2){return res.json(done2)}) );
    },

    reorder: function(options, done) {
        var session = driver.session();
        
        var query =   'WITH ' + JSON.stringify(options.uuids) + ' as uuids'
                    +' UNWIND range(0, size(uuids) - 1) as index'
                    +' MATCH ()-[r:CONTAINS]->(a {uuid:uuids[index]})'
                    +' WITH r, a ORDER BY index ASC'
                    +' WITH COLLECT(r) as rels'
                    +' FOREACH(i IN RANGE(0, SIZE(rels)-1) | FOREACH(x in [rels[i]] | set x.order = i))'
                    +' RETURN rels'
      // console.log(options);
      // console.log(query);
        return session
            .run(query, options)
            .then(result => {
                var record = result.records[0];
                session.close();
                return done( {"relationships" : record.get('rels')} );
            })
            .catch(error => {
                session.close();
               console.log(error);
                return done(error);
                throw error;
            });        
    },

    // Utilies
    separateWords: function(string, options) {
        options = options || {};
        var separator = options.separator || '_';
        var split = options.split || /(?=[A-Z])/;

        return string.split(split).join(separator);
    },

    camelize: function(string) {
        if (this._isNumerical(string)) {
          return string;
        }
        string = string.replace(/[\-_\s]+(.)?/g, function(match, chr) {
          return chr ? chr.toUpperCase() : '';
        });
        // Ensure 1st char is always lowercase
        return string.substr(0, 1).toLowerCase() + string.substr(1);
    },

    pascalize: function(string) {
        var camelized = this.camelize(string);
        // Ensure 1st char is always uppercase
        return camelized.substr(0, 1).toUpperCase() + camelized.substr(1);
    },

    decamelize: function(string, options) {
        return this.separateWords(string, options).toLowerCase();
    },

    // Performant way to determine if obj coerces to a number
    _isNumerical: function(obj) {
        obj = obj - 0;
        return obj === obj;
    }

    // var isDefined = function(value, path) {
    //     path.split('.').forEach(function(key) {
    //         value = value && value[key];
    //     });
    //     return (typeof value != 'undefined' && value !== null);
    // };

};
