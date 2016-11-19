/**
 * @module          controllers/ContentController
 * @description     Server-side logic for managing content
 * @author          Fraser Hore
 * @requires        module:neo4j
 * @help            :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

// Require the neo4j graph database connector
var neo4jBolt = require('neo4j-driver').v1;
var local = require('../../config/local');
var driver = neo4jBolt.driver("bolt://"+local.neo4j.host, neo4jBolt.auth.basic(local.neo4j.user, local.neo4j.password));

var neo4j = require('neo4j');
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

    /**
     * ContentController.view()
     */
    view: function(req, res) {
        var options = {
                view: parseInt(req.param('view')) || "full",
                id: req.param('id') || '52562074-7557-4191-a654-abe5b12c7b35',
                lang: parseInt(req.param('lang')) || "en-gb",
                versionName: req.param('versionName'),
                versionValidityDate: parseInt(req.param('versionValidityDate'))
            };

        ContentService.view(options, function(done){
            //console.log(done);
            return res.view("index", done)
        });       
    },

    getNodeData: function(req, res) {
        var route = req.param('route'),
            routeArray = route.substr(1).split('/');
            langs = ['en-gb', 'fr-fr'],
            lang = 'en-gb',
            id = '',
            urlAlias = '',
            versionName = req.param('versionName'),
            versionValidityDate = parseInt(req.param('versionValidityDate')),
            options = {};
        //console.log(route);
        // Parse route to get either an identity node id or a path to an identity node
        if(routeArray.length) {
            for (var i = 0; i < langs.length; i++) {
                if(routeArray[0] === langs[i]) {
                    lang = routeArray.shift(); // remove the first item of the array and return it
                }
            };
        }
        if(routeArray.length) {
            var regexUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if(regexUuid.test(routeArray[0])) {
                id = routeArray[0];
            } else {
                urlAlias = "/" + routeArray.join('/');
            }
        }
        options = {id: id, urlAlias: urlAlias, lang: lang, versionName: versionName, versionValidityDate: versionValidityDate};
        //console.log(options);
        ContentService.getNodeData(options, function(done){return res.json(done)});
    },

    /** Get template override */
    getViewTemplate: function(req, res) {
        var options = {};
        ContentService.getViewTemplate(options, function(done){return res.json(done)});
    },

    getViewTemplateOverrides: function(req, res) {
        ContentService.getViewTemplateOverrides(function(done){return res.json(done)});
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
    getContent: function(req, res) {
        var options = {
            "id": req.param('id') || 0,
            "lang": parseInt(req.param('lang')) || "en-gb",
            "versionName": req.param('versionName'),
            "versionValidityDate": parseInt(req.param('versionValidityDate'))
        };
        ContentService.getContent(options, function(done){return res.json(done)});
    },

    /** Get child content objects */
    getChildren: function(req, res) {
        var options = {
            "id": req.param('id') || 0,
            "lang": parseInt(req.param('lang')) || "en-gb",
            "versionName": req.param('versionName'),
            "versionValidityDate": parseInt(req.param('versionValidityDate'))
        };
        ContentService.getChildren(options, function(done){return res.json(done)});
    },

    /** Get related content objects 
    * @param {object} req - HTTP request object
    * @param {object} res - HTTP response object
    * @param {object} req.id - Node ID of the content object for which to get related content objects
    */
    getRelated: function(req, res) {
        var options = {
            "id": req.param('id')
        };
        ContentService.getChildren(options, function(done){return res.json(done)});
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
    getSiblings: function(req, res) {
        var options = {
            "id": req.param('id')
        };
        ContentService.getSiblings(options, function(done){return res.json(done)});
    },

    /** Get content type schema */
    getContentTypeSchema: function(req, res) {
        var options = {"contentType": req.param('contenttype')};
        ContentService.getContentTypeSchema(options, function(done){return res.json(done)});
    },

    /** Get child content objects */
    getProcess: function(req, res) {
        var params = {
            "id": req.param('id'),
            "lang": parseInt(req.param('lang')) || "en-gb"
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
                    +' WHERE id(parentNode) = {id} AND versionRel.lang = {lang}'
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

     // TODO: Add url alias subnode with from and to timestamps

    create: function(req, res) {
        console.log(req.body);
        var options = {
                "parentId": req.body.parentId,
                "authorId": req.body.authorId,
                "contenttype": req.body.contenttype,
                "lang": req.body.lang,
                "properties": req.body.properties,
                "relationships": req.body.relationships,
                "identityNamePattern": req.body.identityNamePattern ? req.body.identityNamePattern : 'childversion.' + (req.body.properties.name ? 'name' : req.body.properties.title ? 'title' : req.body.properties.term ? 'term' : req.body.properties.identifier ? 'identifier' : 'name')
            };
        console.log(options);
        ContentService.create(options, function(done){return res.json(done)});       
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
        var options = {
                "id": req.body.id,
                "authorId": req.body.authorId,
                "lang": req.body.lang || "en-gb",
                "properties": req.body.properties,
                "relationships": req.body.relationships,
                "versionName": req.body.versionName || "",
                "identityNamePattern": req.body.identityNamePattern ? req.body.identityNamePattern : 'newversion.' + (req.body.properties.name ? 'name' : req.body.properties.title ? 'title' : req.body.properties.term ? 'term' : req.body.properties.identifier ? 'identifier' : 'name')
            };
        console.log(options);
        ContentService.update(options, function(done){return res.json(done)});       
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

    }

};
