# Godot SDK Generator Fixes

## Issues Fixed

This update fixes three critical issues with the Godot SDK generation:

### 1. Native Class Name Conflicts
**Problem:** Properties and classes named after Godot's native classes (e.g., `Container`, `Resource`, `Image`, `Time`, `OS`) were causing "shadows a native class" errors.

**Solution:** 
- Added automatic detection and sanitization of property names that conflict with Godot native classes
- Conflicting property names are suffixed with `_` (e.g., `Container` becomes `Container_`)
- Conflicting class names are prefixed with `PlayFab` (e.g., `Image` becomes `PlayFabImage`)

**Reserved names handled:**
- Container, Resource, Image, Time, OS, Node, Object
- File, Directory, Thread, Mutex, Semaphore, Engine
- Input, Camera, Light, Texture, Material, Shader
- Animation, AudioStream, VideoStream, PackedScene

### 2. Cyclic Reference Errors
**Problem:** Type hints on properties referencing other classes in the same file were causing "Cyclic reference" errors in GDScript.

**Solution:**
- Removed type hints from all property declarations in model classes
- GDScript will now use dynamic typing for these properties, avoiding forward reference issues
- Properties still have proper default values based on their types

### 3. API Call Type Flexibility
**Problem:** API functions were too strict about requiring typed request objects, causing issues when passing Dictionary objects.

**Solution:**
- Updated API functions to accept both Dictionary and typed request objects
- Added proper type checking with helpful error messages
- Maintains backward compatibility with older code using Dictionary objects

## Files Modified

1. **`targets/GodotSdk/make.js`**
   - Added `godotReservedClassNames` list
   - Added `sanitizePropertyName()` function
   - Added `sanitizeClassName()` function
   - Updated `makeModels()` to sanitize API data before generation
   - Updated `getGDScriptType()` to use sanitized class names
   - Updated `getPropertyInitialization()` and `getPropertySerialization()` to use sanitized names

2. **`targets/GodotSdk/templates/PlayFabModels.gd.ejs`**
   - Updated to use `sanitizeClassName()` for class names
   - Updated to use `sanitizePropertyName()` for property names
   - Removed type hints from property declarations to avoid cyclic references
   - Simplified `_from_dict()` and `to_dict()` methods

3. **`targets/GodotSdk/templates/PlayFabAPI.gd.ejs`**
   - Changed API function signatures to accept untyped `request` parameter
   - Added proper type checking for both Dictionary and typed request objects
   - Improved error handling with descriptive messages
   - Fixed result creation to handle both cases properly

## How to Regenerate the SDK

1. Navigate to the SDKGenerator directory:
   ```bash
   cd E:\dev\github\Godot\SDKGenerator
   ```

2. Run the generator (example using the godot build script):
   ```bash
   # On Windows:
   SDKBuildScripts\Windows\godot_build.bat

   # Or use the shared build script:
   SDKBuildScripts\shared_build.bat
   ```

3. The generated SDK will be in the output directory (check your genConfig.json for the exact path)

4. Copy the generated `addons/playfab` folder to your Godot project

## Expected Results

After regeneration, the SDK should:
- ✅ Load without "shadows a native class" errors
- ✅ Load without "Cyclic reference" errors
- ✅ Accept both Dictionary and typed request objects in API calls
- ✅ Work with existing game code that uses Dictionary objects

## Breaking Changes

**None.** The changes are backward compatible. Existing code using either Dictionary or typed request objects will continue to work.

## Migration Notes

If you have existing code that directly accesses renamed properties:
- `Container` → `Container_`
- `Resource` → `Resource_`
- `Image` → `Image_` (or class becomes `PlayFabImage`)
- `Time` → `Time_`
- `OS` → `OS_`

The API JSON keys remain unchanged, so serialization/deserialization will work correctly.

## Testing Recommendations

1. Regenerate the SDK with the fixes
2. Import into your Godot project
3. Verify no parse errors in the Godot editor
4. Test existing API calls with both Dictionary and typed objects
5. Verify data serialization/deserialization works correctly

## Example Usage

Both of these patterns now work:

```gdscript
# Using Dictionary (backward compatible)
var request = {
    "CustomId": "player123",
    "CreateAccount": true
}
PlayFabClientAPI.LoginWithCustomID(request, on_login_complete)

# Using typed object (new style)
var request = PlayFabClientModels.LoginWithCustomIDRequest.new()
request.CustomId = "player123"
request.CreateAccount = true
PlayFabClientAPI.LoginWithCustomID(request, on_login_complete)
```

## Technical Details

### Property Name Sanitization
The generator now checks each property name against a list of Godot reserved class names (case-insensitive). If a match is found, an underscore is appended to the property name in the generated GDScript code, while preserving the original name for JSON serialization.

### Type Hint Removal
To avoid cyclic reference issues in GDScript, type hints have been removed from property declarations. GDScript will infer types at runtime, which is sufficient for the SDK's use case. The properties still have appropriate default values.

### Flexible API Calls
The API functions now perform runtime type checking to support both Dictionary and typed objects. This maintains backward compatibility while allowing for better code completion and type safety when using typed objects.
