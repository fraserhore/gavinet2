// CREATE

// Match path from root to parent so we can use it later to create the URL alias.
MATCH p = (a:Root)-[:CONTAINS*]->(parent), (author)
// Match on parent uuid and author uuid
WHERE parent.uuid = '26055271-c415-4df5-b5e0-5e8a97ddec3c' AND author.uuid = '46337354-bdbb-4235-bd61-9dcf583b2a1d'

// Create new identity and version
CREATE (parent)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(childidentity:Identity:ContentObject {contentType:"folder"})-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"eng-gb"}]->(childversion:Version)

// Create URL alias identity and version
CREATE (childidentity)-[:URL_ALIAS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(urlAliasIdentity:Identity:UrlAlias {contentType:"urlAlias"})-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"eng-gb"}]->(urlAliasVersion:Version)

// Create relationshps from author to identity nodes and version nodes
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasIdentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasVersion)
SET childidentity:Folder 
SET childversion = {name: 'test name', description: 'test description'}
SET childidentity.name = childversion.name

// Set uuids and URL alias
WITH parent, childidentity, childversion, author, urlAliasIdentity, urlAliasVersion, reduce(urlAlias = "", n IN nodes(p)| urlAlias + "/" + replace(n.name," ", "-")) AS urlAlias
CALL apoc.create.uuids(4) YIELD uuid
WITH parent, childidentity, childversion, author, urlAliasIdentity, urlAliasVersion, collect(uuid) as uuids, urlAlias
SET childidentity.uuid = uuids[0]
SET childversion.uuid = uuids[1]
SET urlAliasIdentity.uuid = uuids[2]
SET urlAliasVersion.uuid = uuids[3]
SET urlAliasVersion.urlAlias = urlAlias + "/" + replace(childversion.name," ", "-")
SET urlAliasIdentity.name = urlAliasVersion.urlAlias

RETURN parent, childidentity, childversion, author, urlAliasIdentity, urlAliasVersion