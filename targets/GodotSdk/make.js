var path = require("path");

// Making resharper less noisy - These are defined in Generate.js
if (typeof (templatizeTree) === "undefined") templatizeTree = function () { };
if (typeof (getCompiledTemplate) === "undefined") getCompiledTemplate = function () { };
var cGDScriptLineComment = "##";

exports.makeCombinedAPI = function (apis, sourceDir, apiOutputDir) {
    var locals = {
        apis: apis,
        buildIdentifier: sdkGlobals.buildIdentifier,
        friendlyName: "PlayFab Godot SDK",
        errorList: apis[0].errorList,
        errors: apis[0].errors,
        sdkVersion: sdkGlobals.sdkVersion,
        getVerticalNameDefault: getVerticalNameDefault
    };

    console.log("Generating Combined Client/Server api from: " + sourceDir + " to: " + apiOutputDir);

    // Output to addons/playfab subdirectory for Godot plugin structure
    var addonOutputDir = path.resolve(apiOutputDir, "addons/playfab");
    
    templatizeTree(locals, path.resolve(sourceDir, "source"), addonOutputDir);
    
    for (var i = 0; i < apis.length; i++) {
        if (apis[i] != null) {
            makeApi(apis[i], sourceDir, addonOutputDir);
            makeModels(apis[i], sourceDir, addonOutputDir);
        }
    }
}

function makeApi(api, sourceDir, apiOutputDir) {
    console.log("Generating GDScript " + api.name + " library to " + apiOutputDir);

    var apiLocals = {
        api: api,
        getAuthParams: getAuthParams,
        getRequestActions: getRequestActions,
        getResultActions: getResultActions,
        getDeprecationAttribute: getDeprecationAttribute,
        generateApiSummary: generateApiSummary,
        hasClientOptions: getAuthMechanisms([api]).includes("SessionTicket"),
        getRequestClassName: getRequestClassName,
        getResultClassName: getResultClassName,
    };

    var apiTemplate = getCompiledTemplate(path.resolve(sourceDir, "templates/PlayFabAPI.gd.ejs"));
    writeFile(path.resolve(apiOutputDir, "PlayFab" + api.name + "API.gd"), apiTemplate(apiLocals));
}

function makeModels(api, sourceDir, apiOutputDir) {
    console.log("Generating GDScript " + api.name + " models to " + apiOutputDir);

    // Sanitize datatype and property names to avoid Godot native class conflicts
    var sanitizedApi = JSON.parse(JSON.stringify(api)); // Deep clone
    for (var d in sanitizedApi.datatypes) {
        var datatype = sanitizedApi.datatypes[d];
        if (!datatype) continue;
        
        // Sanitize datatype name
        var originalName = datatype.name;
        var sanitizedName = sanitizeClassName(originalName);
        if (originalName !== sanitizedName) {
            datatype.name = sanitizedName;
            console.log("  Renamed class " + originalName + " to " + sanitizedName + " to avoid Godot native class conflict");
        }
        
        // Sanitize property names
        if (datatype.properties) {
            for (var p = 0; p < datatype.properties.length; p++) {
                var property = datatype.properties[p];
                var originalPropName = property.name;
                var sanitizedPropName = sanitizePropertyName(originalPropName);
                if (originalPropName !== sanitizedPropName) {
                    property.name = sanitizedPropName;
                    console.log("  Renamed property " + originalPropName + " to " + sanitizedPropName + " in class " + datatype.name);
                }
                
                // Update actualtype references for complex types
                if (property.actualtype && godotReservedClassNamesLower.indexOf(property.actualtype.toLowerCase()) !== -1) {
                    property.actualtype = sanitizeClassName(property.actualtype);
                }
            }
        }
    }

    var modelLocals = {
        api: sanitizedApi,
        sdkGlobals: sdkGlobals,
        getDeprecationAttribute: getDeprecationAttribute,
        generateApiSummary: generateApiSummary,
        getPropertyTypeHint: getPropertyTypeHint,
        getPropertyDefaultValue: getPropertyDefaultValue,
        getPropertyInitialization: getPropertyInitialization,
        getPropertySerialization: getPropertySerialization,
        sanitizePropertyName: sanitizePropertyName,
        sanitizeClassName: sanitizeClassName,
    };

    var modelTemplate = getCompiledTemplate(path.resolve(sourceDir, "templates/PlayFabModels.gd.ejs"));
    writeFile(path.resolve(apiOutputDir, "PlayFab" + api.name + "Models.gd"), modelTemplate(modelLocals));
}

function getVerticalNameDefault() {
    if (sdkGlobals.verticalName) {
        return "\"" + sdkGlobals.verticalName + "\"";
    }

    return "\"\"";
}

function getDeprecationAttribute(tabbing, apiObj) {
    var isDeprecated = apiObj.hasOwnProperty("deprecation") && apiObj.deprecation !== null;
    var deprecationTime = null;
    if (isDeprecated)
        deprecationTime = new Date(apiObj.deprecation.DeprecatedAfter);
    var isError = isDeprecated && (new Date() > deprecationTime) ? "true" : "false";

    if (isDeprecated && apiObj.deprecation.ReplacedBy != null)
        return tabbing + "## [Obsolete: Use '" + apiObj.deprecation.ReplacedBy + "' instead]\n";
    else if (isDeprecated)
        return tabbing + "## [Obsolete: No longer available]\n";
    return "";
}

function getAuthParams(apiCall) {
    if (apiCall.url === "/Authentication/GetEntityToken")
        return "auth_key, auth_value";
    if (apiCall.auth === "EntityToken")
        return "\"X-EntityToken\", PlayFabSettings._internal_settings.entity_token";
    if (apiCall.auth === "SecretKey")
        return "\"X-SecretKey\", PlayFabSettings.developer_secret_key";
    else if (apiCall.auth === "SessionTicket")
        return "\"X-Authorization\", PlayFabSettings._internal_settings.client_session_ticket";
    return "\"\", \"\"";
}

function getRequestActions(tabbing, apiCall, requestVar) {
    requestVar = requestVar || "request";
    
    if (apiCall.result === "LoginResult" || apiCall.request === "RegisterPlayFabUserRequest")
        return tabbing + "# Set TitleId from settings or request\n"
            + tabbing + "if PlayFabSettings.title_id:\n"
            + tabbing + "    " + requestVar + "[\"TitleId\"] = PlayFabSettings.title_id\n"
            + tabbing + "elif " + requestVar + ".has(\"TitleId\"):\n"
            + tabbing + "    " + requestVar + "[\"TitleId\"] = " + requestVar + "[\"TitleId\"]\n"
            + tabbing + "else:\n"
            + tabbing + "    " + requestVar + "[\"TitleId\"] = \"\"\n"
            + tabbing + "\n"
            + tabbing + "if not " + requestVar + ".has(\"TitleId\") or not " + requestVar + "[\"TitleId\"]:\n"
            + tabbing + "    push_error(\"Must have TitleId set to call this method\")\n"
            + tabbing + "    if callback:\n"
            + tabbing + "        callback.call(null, PlayFabErrors.PlayFabError.new({\"error\": \"InvalidRequest\", \"errorMessage\": \"Must have TitleId set\"}))\n"
            + tabbing + "    return\n\n";
    if (apiCall.auth === "EntityToken")
        return tabbing + "if not PlayFabSettings._internal_settings.entity_token:\n"
            + tabbing + "    push_error(\"Must call GetEntityToken before calling this method\")\n"
            + tabbing + "    if callback:\n"
            + tabbing + "        callback.call(null, PlayFabErrors.PlayFabError.new({\"error\": \"NotAuthenticated\", \"errorMessage\": \"Must call GetEntityToken first\"}))\n"
            + tabbing + "    return\n\n";
    if (apiCall.auth === "SessionTicket")
        return tabbing + "if not PlayFabSettings._internal_settings.client_session_ticket:\n"
            + tabbing + "    push_error(\"Must be logged in to call this method\")\n"
            + tabbing + "    if callback:\n"
            + tabbing + "        callback.call(null, PlayFabErrors.PlayFabError.new({\"error\": \"NotAuthenticated\", \"errorMessage\": \"Must be logged in\"}))\n"
            + tabbing + "    return\n\n";
    if (apiCall.auth === "SecretKey")
        return tabbing + "if not PlayFabSettings.developer_secret_key:\n"
            + tabbing + "    push_error(\"Must have DeveloperSecretKey set to call this method\")\n"
            + tabbing + "    if callback:\n"
            + tabbing + "        callback.call(null, PlayFabErrors.PlayFabError.new({\"error\": \"NotAuthenticated\", \"errorMessage\": \"Must have DeveloperSecretKey set\"}))\n"
            + tabbing + "    return\n\n";
    if (apiCall.url === "/Authentication/GetEntityToken")
        return tabbing + "var auth_key: String = \"\"\n"
            + tabbing + "var auth_value: String = \"\"\n"
            + tabbing + "if PlayFabSettings._internal_settings.entity_token:\n"
            + tabbing + "    auth_key = \"X-EntityToken\"\n"
            + tabbing + "    auth_value = PlayFabSettings._internal_settings.entity_token\n"
            + tabbing + "elif PlayFabSettings._internal_settings.client_session_ticket:\n"
            + tabbing + "    auth_key = \"X-Authorization\"\n"
            + tabbing + "    auth_value = PlayFabSettings._internal_settings.client_session_ticket\n"
            + tabbing + "elif PlayFabSettings.developer_secret_key:\n"
            + tabbing + "    auth_key = \"X-SecretKey\"\n"
            + tabbing + "    auth_value = PlayFabSettings.developer_secret_key\n\n";
    return "";
}

function getResultActions(tabbing, apiCall, api) {
    if (apiCall.result === "LoginResult" || apiCall.result === "RegisterPlayFabUserResult")
        return tabbing + "if playfab_result:\n" 
            + tabbing + "    if playfab_result.has(\"SessionTicket\"):\n"
            + tabbing + "        PlayFabSettings._internal_settings.client_session_ticket = playfab_result[\"SessionTicket\"]\n"
            + tabbing + "    if playfab_result.has(\"EntityToken\") and playfab_result[\"EntityToken\"].has(\"EntityToken\"):\n"
            + tabbing + "        PlayFabSettings._internal_settings.entity_token = playfab_result[\"EntityToken\"][\"EntityToken\"]\n";
    else if (apiCall.result === "GetEntityTokenResponse")
        return tabbing + "if playfab_result and playfab_result.has(\"EntityToken\"):\n"
            + tabbing + "    PlayFabSettings._internal_settings.entity_token = playfab_result[\"EntityToken\"]\n";
    else if (apiCall.result === "AuthenticateCustomIdResult")
        return tabbing + "if playfab_result and playfab_result.has(\"EntityToken\") and playfab_result[\"EntityToken\"].has(\"EntityToken\"):\n"
            + tabbing + "    PlayFabSettings._internal_settings.entity_token = playfab_result[\"EntityToken\"][\"EntityToken\"]\n";
    return "";
}

function generateApiSummary(tabbing, apiElement, summaryParam, extraLines) {
    var lines = generateApiSummaryLines(apiElement, summaryParam, extraLines);
    
    var output = "";
    if (lines.length === 1 && lines[0]) {
        output = tabbing + "## " + lines.join("\n" + tabbing + "## ") + "\n";
    } else if (lines.length > 0) {
        output = tabbing + "## " + lines.join("\n" + tabbing + "## ") + "\n";
    }
    return output;
}

function getRequestClassName(apiCall, api) {
    if (!apiCall.request) return "Dictionary";
    return "PlayFab" + api.name + "Models." + apiCall.request;
}

function getResultClassName(apiCall, api) {
    if (!apiCall.result) return "Dictionary";
    return "PlayFab" + api.name + "Models." + apiCall.result;
}

// List of reserved Godot native class names that would cause shadowing errors
var godotReservedClassNames = [
    "Container", "Resource", "Image", "Time", "OS", "Node", "Object", 
    "File", "Directory", "Thread", "Mutex", "Semaphore", "Engine",
    "Input", "Camera", "Light", "Texture", "Material", "Shader",
    "Animation", "AudioStream", "VideoStream", "PackedScene"
];

// List of reserved Godot native class names (lowercase for case-insensitive comparison)
var godotReservedClassNamesLower = godotReservedClassNames.map(function(name) { return name.toLowerCase(); });

// Sanitize property names that conflict with Godot native classes
function sanitizePropertyName(propertyName) {
    if (godotReservedClassNamesLower.indexOf(propertyName.toLowerCase()) !== -1) {
        return propertyName + "_";  // Append underscore to avoid conflict
    }
    return propertyName;
}

// Sanitize class names that conflict with Godot native classes
function sanitizeClassName(className) {
    if (godotReservedClassNamesLower.indexOf(className.toLowerCase()) !== -1) {
        return "PlayFab" + className;  // Prefix with PlayFab to avoid conflict
    }
    return className;
}

function getGDScriptType(property, datatype) {
    var propertyType = property.actualtype;
    
    if (property.collection === "array") {
        return "Array";
    } else if (property.collection === "map") {
        return "Dictionary";
    } else if (propertyType === "Boolean") {
        return "bool";
    } else if (propertyType === "int16" || propertyType === "int32" || propertyType === "int64" || 
               propertyType === "uint16" || propertyType === "uint32" || propertyType === "uint64") {
        return "int";
    } else if (propertyType === "float" || propertyType === "double") {
        return "float";
    } else if (propertyType === "String") {
        return "String";
    } else if (propertyType === "DateTime") {
        return "String";  // Godot doesn't have a native DateTime, use String (ISO 8601 format)
    } else if (propertyType === "object") {
        return "Dictionary";
    } else {
        // Complex type - another model class
        return sanitizeClassName(propertyType);
    }
}

function getPropertyTypeHint(property, datatype) {
    var gdType = getGDScriptType(property, datatype);
    
    if (property.optional) {
        return "";  // No type hint for optional properties to allow null
    }
    
    return ": " + gdType;
}

function getPropertyDefaultValue(property) {
    if (property.optional) {
        return "= null";
    }
    
    var propertyType = property.actualtype;
    
    if (property.collection === "array") {
        return "= []";
    } else if (property.collection === "map") {
        return "= {}";
    } else if (propertyType === "Boolean") {
        return "= false";
    } else if (propertyType === "int16" || propertyType === "int32" || propertyType === "int64" || 
               propertyType === "uint16" || propertyType === "uint32" || propertyType === "uint64") {
        return "= 0";
    } else if (propertyType === "float" || propertyType === "double") {
        return "= 0.0";
    } else if (propertyType === "String") {
        return "= \"\"";
    } else if (propertyType === "DateTime") {
        return "= \"\"";
    } else if (propertyType === "object") {
        return "= {}";
    } else {
        // Complex type
        return "= null";
    }
}

function getPropertyInitialization(property, datatype, api) {
    var tabbing = "        ";
    var propName = property.name;
    var sanitizedPropName = sanitizePropertyName(propName);
    var output = "";
    
    if (property.collection === "array") {
        output += tabbing + "if data.has(\"" + propName + "\"):\n";
        output += tabbing + "    " + sanitizedPropName + " = data[\"" + propName + "\"]\n";
    } else if (property.collection === "map") {
        output += tabbing + "if data.has(\"" + propName + "\"):\n";
        output += tabbing + "    " + sanitizedPropName + " = data[\"" + propName + "\"]\n";
    } else {
        output += tabbing + "if data.has(\"" + propName + "\"):\n";
        output += tabbing + "    " + sanitizedPropName + " = data[\"" + propName + "\"]\n";
    }
    
    return output;
}

function getPropertySerialization(property, datatype, api) {
    var tabbing = "            ";
    var propName = property.name;
    var sanitizedPropName = sanitizePropertyName(propName);
    var output = "";
    
    if (property.collection === "array" || property.collection === "map") {
        output += tabbing + "result[\"" + propName + "\"] = " + sanitizedPropName + "\n";
    } else {
        output += tabbing + "result[\"" + propName + "\"] = " + sanitizedPropName + "\n";
    }
    
    return output;
}



