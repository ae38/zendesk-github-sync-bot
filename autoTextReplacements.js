const textReplacements = require('./autoTextReplacements.json');

// replaces all things in input based on in JSON replies 
function processReplacements(input)
{

var output = input;

for (var key in textReplacements) {
    // replace one by one
    output = replace_insensitive(output, key, textReplacements[key]);
}

if (output !== '')
 return output;
else 
 return input;

}

// takes input and CASE insensitive replaces substring to replaceto 
function replace_insensitive( input, substring, replaceto )
{
    //return input.replace( new RegExp( "([ $^\.\,\"\'\f\r\t\n]*)\\$(" + preg_quote( substring ) + ")([ $^\.\,\"\'\f\r\t\n]*)" , 'i' ), replaceto );
    return input.replace( new RegExp( "\\$(" + preg_quote( substring ) + ")" , 'i' ), replaceto );    
}

// http://stackoverflow.com/questions/1144783/how-to-replace-all-occurrences-of-a-string-in-javascript
function preg_quote( str ) {
    // http://kevin.vanzonneveld.net
    // +   original by: booeyOH
    // +   improved by: Ates Goral (http://magnetiq.com)
    // +   improved by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // *     example 1: preg_quote("$40");
    // *     returns 1: '\$40'
    // *     example 2: preg_quote("*RRRING* Hello?");
    // *     returns 2: '\*RRRING\* Hello\?'
    // *     example 3: preg_quote("\\.+*?[^]$(){}=!<>|:");
    // *     returns 3: '\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:'

    return (str+'').replace(/([\\\.\+\*\?\[\^\]\$\(\)\{\}\=\!\<\>\|\:])/g, "\\$1");
}

module.exports.processReplacements = processReplacements;