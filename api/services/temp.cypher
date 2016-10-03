MATCH p = (a:Root)-[:CONTAINS*]->(parent), (author)
WHERE parent.uuid = '26055271-c415-4df5-b5e0-5e8a97ddec3c' AND author.uuid = {authorUuid}
CREATE (parent)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->
(childidentity:Identity:ContentObject {contentType:{contenttype}})
-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"{lang}"}]->
(childversion:Version)
CREATE (childidentity)-[:URL_ALIAS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->
(urlAliasIdentity:Identity:UrlAlias {contentType:"urlAlias"})
-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"{lang}"}]->
(urlAliasVersion:Version)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasIdentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasVersion)
SET childidentity: + ContentService.pascalize(options.contenttype) 
SET childversion = {properties}
SET childidentity.name = + identityNamePattern
CALL apoc.create.uuid() YIELD uuid
SET childidentity.uuid = uuid
SET childversion.uuid = uuid
SET urlAliasIdentity.uuid = uuid
SET urlAliasVersion.uuid = uuid
WITH parent, childidentity, childversion, author, urlAliasIdentity, urlAliasVersion, 
     reduce(urlAlias = "", n IN nodes(p)| urlAlias + "/" + replace(n.name," ", "-")) AS reduction
SET urlAliasVersion.urlAlias = reduction + "/" + childversion.name
RETURN parent,childidentity,childversion,author,urlAliasIdentity,urlAliasVersion