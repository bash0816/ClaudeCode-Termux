'use strict';
// qle 形: X=(a,b,c)=>FN()?AR(b,c(),a):{module:b,folder:a}
const QLE_PATTERN_SOURCE = '(\\b[\\w$]+=\\(([\\w$]+),([\\w$]+),([\\w$]+)\\)=>)[\\w$]+\\(\\)\\?([\\w$]+)\\(\\3,\\4\\(\\),\\2\\):\\{module:\\3,folder:\\2\\}';
const QLE_REPLACEMENT = '$1(!0)?$5($3,$4(),$2):{module:$3,folder:$2}';
function countQleMatches(source) { return (source.match(new RegExp(QLE_PATTERN_SOURCE, 'g')) || []).length; }
function applyQlePatch(source) { return source.replace(new RegExp(QLE_PATTERN_SOURCE, 'g'), QLE_REPLACEMENT); }
module.exports = { QLE_PATTERN_SOURCE, QLE_REPLACEMENT, countQleMatches, applyQlePatch };
