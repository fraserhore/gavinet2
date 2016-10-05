// CREATE

// Match path from root to parent so we can use it later to create the URL alias.
MATCH p = (a:Root)-[:CONTAINS*]->(parent)
// Match on parent uuid and author uuid
WHERE parent.uuid = '26055271-c415-4df5-b5e0-5e8a97ddec3c'

// Create new identity and version
CREATE (parent)-[:CONTAINS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(childidentity:Identity:ContentObject {contentType:"folder"})-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"eng-gb"}]->(childversion:Version)

// Create URL alias identity and version
CREATE (childidentity)-[:URL_ALIAS {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial"}]->(urlAliasIdentity:Identity:UrlAlias {contentType:"urlAlias"})-[:VERSION {from:timestamp(), to:9007199254740991, versionNumber:1, versionName:"Initial", lang:"eng-gb"}]->(urlAliasVersion:Version)

// Set properties
SET childidentity:Folder 
SET childversion = {name: 'test name 3', description: 'test description 3'}
SET childidentity.name = childversion.name

WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, reduce(urlAlias = "", n IN nodes(p)| urlAlias + "/" + replace(n.name," ", "-")) + "/" + replace(childversion.name," ", "-") AS urlAlias
MATCH (author)
WHERE author.uuid = '46337354-bdbb-4235-bd61-9dcf583b2a1d'

// Create relationshps from author to identity nodes and version nodes
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childidentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(childversion)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasIdentity)
CREATE (author)-[:CREATED {timestamp:timestamp()}]->(urlAliasVersion)

// Set URL Alias
SET urlAliasIdentity.name = urlAlias
SET urlAliasVersion.urlAlias = urlAlias

// Set uuids
WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author
CALL apoc.create.uuids(4) YIELD uuid
WITH parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author, collect(uuid) as uuids
SET childidentity.uuid = uuids[0]
SET childversion.uuid = uuids[1]
SET urlAliasIdentity.uuid = uuids[2]
SET urlAliasVersion.uuid = uuids[3]

RETURN parent, childidentity, childversion, urlAliasIdentity, urlAliasVersion, author