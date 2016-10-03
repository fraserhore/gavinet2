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
            params = {
                "id": options.id,
                "urlAlias": options.urlAlias,
                "lang": options.lang
            },
            query = '',
            versionMatch = "";

        if(versionName) {
            versionMatch = " AND version.name = " + options.versionName;
        } else if(versionValidityDate) {
            versionMatch = " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate;
        } else {
            versionMatch = " AND version.to = 9007199254740991";
        }
        //console.log(versionMatch);

        if(options.urlAlias) {
            query =   'MATCH (urlAliasVersion)<-[urlAliasVersionRel:VERSION]-(urlAliasIdentity)-[:URL_ALIAS]-(identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)'
                    +' WHERE urlAliasVersion.urlAlias = {urlAlias} AND version.lang = {lang}'
                    +  versionMatch
                    +' RETURN identityNode, version, versionNode, authorNode, urlAliasVersion.urlAlias as urlAlias';
        } else {
            query =   'MATCH (urlAliasVersion)<-[urlAliasVersionRel:VERSION]-(urlAliasIdentity)-[:URL_ALIAS]-(identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)'
                    +' WHERE identityNode.uuid = {id} AND urlAliasVersionRel.to = 9007199254740991 AND version.lang = {lang}'
                    +  versionMatch
                    +' RETURN identityNode, version, versionNode, authorNode, urlAliasVersion.urlAlias as urlAlias';
        }
        // console.log(query);
        return session
            .run(query, params)
            .then(result => {
                session.close();
                var record = result.records[0];
                return done({
                    'identityNode': record.get('identityNode'), 
                    'version': record.get('version'),
                    'versionNode': record.get('versionNode'),
                    'authorNode': record.get('authorNode'),
                    'lang': options.lang
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
                    ContentService.getViewTemplateOverrides(function(viewTemplateOverrides) {
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

    getViewTemplateOverrides: function(done) {
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
                    console.log(data[i].ID);
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
                console.log(query);
                var cb = function(error, cypherData) {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log(cypherData);
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
                    console.log(delay);
                    console.log(i);
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
                                        console.log(error);
                                    } else {
                                        console.log('Cypher results');
                                        console.log(cypherData);
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
                    console.log(delay);
                    console.log(i);
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
                                                console.log('ECONNREFUSED Caught');     
                                            }
                                            console.log(error);
                                        } else {
                                            console.log('Cypher results');
                                            console.log(cypherData);
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
                                            console.log(error);
                                        } else {
                                            console.log('Cypher results');
                                            console.log(cypherData);
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


    /** Get child content objects */
    getContent: function(options, done) {
        var session = driver.session();
        var params = {
            "id": options.id,
            "lang": options.lang
        };
        var versionMatch = "";

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
            .run(query, params)
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

    /** Get child content objects */
    getChildren: function(options, done) {
        var session = driver.session();
        var params = {
            "id": options.id,
            "lang": options.lang
        };
        var versionMatch = "";

        if(options.versionName) {
            versionMatch = " AND version.name = " + options.versionName;
        } else if(options.versionValidityDate) {
            versionMatch = " AND version.from <= " + options.versionValidityDate + " AND version.to >= " + options.versionValidityDate;
        } else {
            versionMatch = " AND parentChildRel.to = 9007199254740991 AND version.to = 9007199254740991";
        }
        var query =   'MATCH (parentNode)-[parentChildRel:CONTAINS]->(identityNode)-[version:VERSION]->(versionNode), (authorNode)-[created:CREATED]->(identityNode)-[:URL_ALIAS]->(urlAliasIdentity)-[urlAliasVersionRel:VERSION]->(urlAliasVersion)'
                    +' WHERE parentNode.uuid = {id} AND version.lang = {lang} AND urlAliasVersionRel.to = 9007199254740991'
                    +  versionMatch
                    +' RETURN identityNode, version, versionNode, authorNode, urlAliasVersion.urlAlias as urlAlias';
        return session
            .run(query, params)
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
                return done(children);
            })
            .catch(error => {
                session.close();
                console.log(error);
                return done(error);
                throw error;
            });      
    },

    /** Get related content objects 
    * @param {object} req - HTTP request object
    * @param {object} res - HTTP response object
    * @param {object} req.id - Node ID of the content object for which to get related content objects
    */
    getRelated: function(req, res) {
        var query =  'MATCH (a)-[r]-(b), (b)-[:VERSION {to:9007199254740991}]->(c)'
                    +' WHERE id(a) = {id} AND NOT (a)-[r:VERSION|:CREATED|:CONTAINS]->(b) AND NOT (a)<-[r:VERSION|:CREATED|:CONTAINS]-(b)'
                    +' RETURN b as identityNode, r as relationship, c as versionNode'
        var params = {
            "id": req.param('id')
        };
        var cb = function(err, data) {
            return res.json(data);
        }
        db.cypher({
            query: query,
            params: params
        }, cb);
    },

    /** Get content types */
    getContentTypes: function(req, res) {

        var query =  'MATCH (a:ContentType)-[:VERSION {to:9007199254740991}]->(b:Version)'
                    +' RETURN a as contentTypeIdentity, b as contentTypeVersion'
        var params = {
            "id": ''
        };
        var cb = function(err, data) {
            //console.log(data);
            return res.json(data);
        }
        db.cypher({
            query: query,
            params: params
        }, cb);
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
                console.log(error);
                return done(error);
                throw error;
            });        
    },

    /** Get content type schema */
    getContentTypeSchema: function(req, res) {

        var query =     'MATCH (contentTypeIdentity:ContentType)-[:VERSION {to:9007199254740991}]->(contentTypeVersion:Version {identifier:{contenttype}}),'
                    + ' (contentTypeIdentity)-[:PROPERTY|RELATIONSHIP|CONTAINS {to:9007199254740991}]->(propertyIdentity)-[:VERSION {to:9007199254740991}]->(propertyVersion:Version)'
                    + ' RETURN contentTypeIdentity, contentTypeVersion, collect(propertyIdentity) as propertyIdentities, collect(propertyVersion) as propertyVersions'
        var params = {
            "contenttype": req.param('contenttype')
        };
        //console.log(req.param('contenttype'));
        var cb = function(err, data) {
            //console.log(data);
            if(!data) return;
            if(!data[0]) return;
            //console.log(err);

            var contentTypeVersionProperties = data[0].contentTypeVersion.properties,
                propertyVersions = data[0].propertyVersions,
                schema = {};

            //schema["$schema"] = "http://json-schema.org/draft-04/schema#";
            schema = data[0].contentTypeVersion.properties;
            schema["properties"] = {};

            //console.log[schema];

            for (var i = 0; i < propertyVersions.length; i++) {
                schema.properties[propertyVersions[i].properties.identifier] = propertyVersions[i].properties;
            };
            return res.json(schema);
        }
        db.cypher({
            query: query,
            params: params
        }, cb);
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
        console.log(query);
        var cb = function(err, data) {
            if(err) {
                console.log(err);
            } else if(data[0]) {
                console.log(data[0].result.children);
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
    create: function(options, done) {
        var session = driver.session();
        var properties = options.properties,
            relationships = options.relationships,
            matchRelated = '',
            whereRelated = '',
            createRelationships = '';
        if(relationships) {
            for (var i = relationships.length - 1; i >= 0; i--) {
                console.log(relationships[i]);
                var relationshipName = relationships[i].relationshipName.toUpperCase(),
                    direction = relationships[i].direction,
                    inboundSymbol = direction === 'inbound' ? '<' : '',
                    outboundSymbol = direction === 'outbound' ? '>' : '',
                    relatedNode = relationships[i].relatedNode,
                    relatedNodeId = relatedNode.properties.uuid,
                    relatedIdentifier = 'node' + relatedNodeId;

                matchRelated += ', (' + relatedIdentifier + ')';
                whereRelated += ' AND id(' + relatedIdentifier + ') = ' + relatedNodeId;
                createRelationships += ' CREATE (childidentity)' + inboundSymbol + '-[:' + relationshipName + ' {from:timestamp(), to:9007199254740991}]-' + outboundSymbol + '(' + relatedIdentifier + ')';
                //console.log(matchRelated);
            };
        }
        //console.log(options);
        var query =  // Match path from root to parent so we can use it later to create the URL alias.
					 ' MATCH p = (a:Root)-[:CONTAINS*]->(parent)' + matchRelated
					// Match on parent uuid and author uuid
                    +' WHERE parent.uuid = {parentId}' + whereRelated
                    // Create new identity and version
                    +' CREATE (parent)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                    +       '(childidentity:Identity:ContentObject {contentType:{contenttype}})'
                    +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:{lang}}]->'
                    +       '(childversion:Version)'
                    // Create URL alias identity and version
                    +' CREATE (childidentity)-[:URL_ALIAS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->'
                    +       '(urlAliasIdentity:Identity:UrlAlias {contentType:"urlAlias"})'
                    +       '-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:{lang}}]->'
                    +       '(urlAliasVersion:Version)'
                    + createRelationships
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
                    // Return results
                    +' RETURN parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author';
        return session
            .run(query, options)
            .then(result => {
                session.close();
                var record = result.records[0];
                console.log(record.get('childversion'));
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
                console.log(error);
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
                    + ' {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->to'
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
    update: function(req, res) {
        var properties = req.body.properties,
            relationships = req.body.relationships,
            matchRelated = '',
            whereRelated = '',
            createRelationships = '',
            identityNamePattern = req.body.identityNamePattern ? req.body.identityNamePattern : 'newversion.' + (properties.name ? 'name' : properties.title ? 'title' : properties.term ? 'term' : properties.identifier ? 'identifier' : '');
        
        if(relationships) {
            for (var i = relationships.length - 1; i >= 0; i--) {
                console.log(relationships[i]);
                var relationshipName = relationships[i].relationshipName.toUpperCase(),
                    direction = relationships[i].direction,
                    inboundSymbol = direction === 'inbound' ? '<' : '',
                    outboundSymbol = direction === 'outbound' ? '>' : '',
                    relatedNode = relationships[i].relatedNode,
                    relatedNodeId = relatedNode.properties.uuid,
                    relatedIdentifier = 'node' + relatedNodeId;

                matchRelated += ', (' + relatedIdentifier + ')';
                whereRelated += ' AND id(' + relatedIdentifier + ') = ' + relatedNodeId;
                createRelationships += ' CREATE (identityNode)' + inboundSymbol + '-[:' + relationshipName + ' {from:timestamp(), to:9007199254740991}]-' + outboundSymbol + '(' + relatedIdentifier + ')';
            };
        }

        var query = 
            // UPDATE (CONTENT) - Add a Version node
              ' MATCH (identityNode)-[currentversionrelationship:VERSION {to:9007199254740991}]->(currentversion)' + matchRelated
            + ' WHERE identityNode.uuid = {id} AND currentversionrelationship.lang = {lang}' + whereRelated
            // Update the current version relationship to end validity
            + ' SET currentversionrelationship.to = timestamp()'
            // Create the new version relationship and node
            + ' CREATE identityNode-[newversionrelationship:VERSION {from:timestamp(), to:9007199254740991}]->(newversion:Version)'
            + createRelationships
            // Set new version relationship properties
            + ' SET newversionrelationship.versionNumber = toInt(currentversionrelationship.versionNumber) + 1'
            + ' SET newversionrelationship.versionName = {versionName}'
            + ' SET newversionrelationship.lang = currentversionrelationship.lang'
            // Set new version node properties
            + ' SET newversion = {properties}'
            //... update more newversion properties
            // Update the identity node
            + ' SET identityNode.name = ' + identityNamePattern
            // Create a previous relationship from the new version to the previous version
            + ' CREATE newversion-[:PREVIOUS]->currentversion'
            // Return the affected nodes
            + ' RETURN identityNode,currentversion,newversion';
        var params = {
            "id": parseInt(req.body.id),
            "lang": req.body.lang,
            "versionName": req.body.versionName,
            "identityNamePattern": req.body.identityNamePattern,
            "properties": req.body.properties
        };
        console.log(properties);
        console.log(relationships);
        console.log(query);
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
            console.log(err);
            console.log("delete: "+req.param('id'));
            console.log(data);
            return res.json(data);
        };
        db.cypher({
            query: query, 
            params: params
        }, cb);
    },

    /** Move a content object (end validity of old location relationship and create new location relationship) */
    move: function(req, res) {

    },

    /** Add content object to an additional location (create new location relationship) */
    addLocation: function(req, res) {

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
