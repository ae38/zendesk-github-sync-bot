require('dotenv').config(); // this reads from .env file or uses default ENV variables 
var escape = require('escape-html');
var autoTextReplacements = require('./autoTextReplacements.js');

// begin - testing code
// testing auto replacements - commented out 
var newStr = '';
var newStr = autoTextReplacements.processReplacements('you may find all the current prices at our pricing page or $pricing page');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('watermarking.exe $watermarking.exe');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('watermarking');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('\nwatermarking\n');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('\r\nwatermarking\n');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('\n watermarking\n');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('watermarking\n');
console.log(newStr);

newStr = autoTextReplacements.processReplacements('\n $watermarking\n');
console.log(newStr);
newStr = autoTextReplacements.processReplacements('\n $ watermarking\n');
console.log(newStr);

newStr = autoTextReplacements.processReplacements('$watermarking\n');
console.log(newStr);
 // end 

return 0;

// end of testing code