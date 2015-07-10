/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: syntax_hilite.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: Syntax highlighting
******************************************************************************/
'use strict';

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/iteratorUtils.jsm');
Components.utils.import("resource://gre/modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = [];

Stationery.definePreference('SourceEditOptions', { type: 'json', default: {
  wordWrap: true,
  lineSeparator: false,
  base: { c: 'black', bk: 'white', f: 'monospace', fs: 10},
  markup: { c: 'fuchsia', bk: 'white', b: true, i: false },
  tag: { c: 'blue', bk: 'white', b: true, i: false },
  attrib: { c: 'green', bk: 'white', b: false, i: false },
  attValue: { c: 'black', bk: 'white', b: true, i: false },
  doctype: { c: 'white', bk: 'gray', b: true, i: false },
  comment: { c: 'gray', bk: 'white', b: false, i: false },
} });

Stationery.syntax = {
  getStyleBlock: function() {
    try{
      let prefs = Stationery.getPref('SourceEditOptions');
      
      let result = [];
      result.push('<style type="text/css">');
      result.push(' body { ' + getCSS(prefs.base) + ' }');
      if (prefs.wordWrap)
        result.push(' body { white-space: pre-wrap; }');
      else
        result.push(' body { white-space: pre; }');
      
      result.push(' .m { ' + getCSS(prefs.markup) + ' }');
      result.push(' .t { ' + getCSS(prefs.tag) + ' }');
      result.push(' .n { ' + getCSS(prefs.attrib) + ' }');
      result.push(' .v { ' + getCSS(prefs.attValue) + ' }');
      result.push(' .doctype { ' + getCSS(prefs.doctype) + ' }');
      result.push(' .c { ' + getCSS(prefs.comment) + ' }');
      
      //class "line" is used to speed-up editing. apparently nsiEditor did not like a lot of <span> elements, so I use <div> elements to group them.
      result.push(' .line { min-height: 1.3em; }');
      if (prefs.lineSeparator)
        result.push(' .line { border-bottom: 1px solid #D0D0D0; }');

      result.push('</style>');
    
      return result.join('\n');
    } catch (e) { Stationery.handleException(e); return ''; }
  },

  getBody: function(sourceHtml) {
    try {
      let hl = {
        result: [],
        lineBreakState: [],
      
        currentCharIdx: 0,
        bufferStartCharIdx: 0,
        sourceLen: sourceHtml.length,
      
        tagName: '',
        isOpeningTag: false,
        quotedAttribValue: '',
      }
        
      hl.doWork = function() {
        while (hl.currentCharIdx < hl.sourceLen) {
        
          //markup begin character
          if (sourceHtml[hl.currentCharIdx] == '<') {
            
            //check it is doctype ... 
            if (sourceHtml.substr(hl.currentCharIdx, 9) == '<!DOCTYPE') {
              hl.pushLineBreakState('<span class="doctype">', '</span>');
              hl.startAcummulatingBuffer();
              while(hl.currentCharIdx < hl.sourceLen && sourceHtml[hl.currentCharIdx] != '>') ++hl.currentCharIdx;
              hl.pushBufferIfNotEmpty();
              hl.popLineBreakState();
              continue;
            }

            //check it is comment... 
            if (sourceHtml.substr(hl.currentCharIdx, 4) == '<!--') { 
              hl.pushLineBreakState('<span class="c">', '</span>');
              hl.result.push(encodeHtmlEntities('<!--'));
              hl.currentCharIdx += 4; // "<!--"
              hl.startAcummulatingBuffer();
              while(hl.currentCharIdx < hl.sourceLen && sourceHtml.substr(hl.currentCharIdx, 3) != '-->') ++hl.currentCharIdx;
              hl.pushBufferIfNotEmpty();
              hl.result.push(encodeHtmlEntities('-->'));
              hl.currentCharIdx += 3; // "-->"
              hl.popLineBreakState();
              continue;
            }
            
            //is other html tag, so ...
            hl.isOpeningTag = sourceHtml.substr(hl.currentCharIdx, 2) != '</';
            if(hl.isOpeningTag) {
              hl.result.push('<span class="m">&lt;</span>');
              ++hl.currentCharIdx;
            } else {
              hl.result.push('<span class="m">&lt;/</span>');
              hl.currentCharIdx += 2;
            }
            
            hl.skipWhiteSpaces();
            
            // now we looking for tag name, till first white space, or end of tag
            hl.startAcummulatingBuffer();
            while(hl.currentCharIdx < hl.sourceLen) {
              let c = sourceHtml[hl.currentCharIdx];
              if ((c == ' ') || (c == '\n') || (c == '\t') || (c == '/') || (c == '=') || (c == '"') || (c == "'") || (c == '>') || (c == '<') || (c == '&'))
                break;
              ++hl.currentCharIdx;
            }
            hl.tagName = hl.getAcummulatedBuffer('');
            hl.result.push('<span class="t">' + hl.tagName + '</span>');

            //process attribs
            while(hl.currentCharIdx < hl.sourceLen) {
              let c = sourceHtml[hl.currentCharIdx];
              if ((c == '/') || (c == '>'))
                break;

              hl.skipWhiteSpaces();
              //get attribute name
              hl.startAcummulatingBuffer();
              while(hl.currentCharIdx < hl.sourceLen) {
                let c = sourceHtml[hl.currentCharIdx];
                if ((c == ' ') || (c == '\n') || (c == '\t') || (c == '/') || (c == '=') || (c == '"') || (c == "'") || (c == '>') || (c == '<') || (c == '&'))
                  break;
                ++hl.currentCharIdx;
              }
              hl.result.push('<span class="n">' + hl.getAcummulatedBuffer('') + '</span>');
              hl.skipWhiteSpaces();
                
              //here should be '=', otherwise it is empty atrib
              if(sourceHtml[hl.currentCharIdx] == '=') {
                hl.result.push('<span class="m">=</span>');
                ++hl.currentCharIdx;
              
                hl.skipWhiteSpaces();
                  
                //there may be qoute or not
                let c = sourceHtml[hl.currentCharIdx];
                if ((c == '"') || (c == "'")) {
                  hl.quotedAttribValue = c;
                  hl.result.push('<span class="m">' + hl.quotedAttribValue + '</span>');
                  ++hl.currentCharIdx;
                } else
                  hl.quotedAttribValue = '';

                //get attribute value
                hl.startAcummulatingBuffer();
                while (hl.currentCharIdx < hl.sourceLen) {
                  let c = sourceHtml[hl.currentCharIdx];
                  if (hl.quotedAttribValue == '' /*no quotes*/) {
                    if ((c == ' ') || (c == '\n') || (c == '\t') || (c == '/') || (c == '>') || (c == '<'))
                      break
                  } else {
                    if (c == hl.quotedAttribValue)
                      break;
                    //special case for very invalid HTMl, when somebody edits quoted attrib value
                    //returning null prevents applying syntax
                    if((c == '>') || (c == '<'))
                      return null;
                  }
                  ++hl.currentCharIdx;
                }
                hl.pushLineBreakState('<span class="v">', '</span>');
                hl.pushBufferIfNotEmpty();
                hl.popLineBreakState();
                
                c = sourceHtml[hl.currentCharIdx];
                if (c == hl.quotedAttribValue) {
                  hl.result.push('<span class="m">' + c + '</span>');
                  ++hl.currentCharIdx;
                  hl.quotedAttribValue = '';
                }
              }
            }
            hl.skipWhiteSpaces();
                  
            //here we are at end of html tag
            if(sourceHtml.substr(hl.currentCharIdx, 2) == '/>') { //optimized version, 2 characters in same span
              hl.result.push('<span class="m">/&gt;</span>');
              hl.currentCharIdx += 2;
            }else
              if(sourceHtml[hl.currentCharIdx] == '>') {
                hl.result.push('<span class="m">&gt;</span>');
                ++hl.currentCharIdx;
              }
            
            //Handle special tags internal content
            if (hl.isOpeningTag && hl.tagName.match(/.*style.*/i))
              hl.handleStyleBlock();
              
            //TODO: handle CDATA??

            continue;
          }
          
          //todo: try collect buffer for standard characters.
          hl.result.push(hl.addLineBreaks(encodeHtmlEntities(sourceHtml[hl.currentCharIdx])));
          ++hl.currentCharIdx;
        }
        
        return '<div class="line">' + hl.result.join('') + '</div>';
      };

      hl.handleHtmlTag = function() {
      }
      
      
      hl.handleStyleBlock = function() {
        hl.skipWhiteSpaces();
        //optional "<!--"
        if (sourceHtml.substr(hl.currentCharIdx, 4) == '<!--') {
          hl.result.push('<span class="c">&lt;!--</span>');
          hl.currentCharIdx += 4; // "<!--"
        }
      
        hl.startAcummulatingBuffer();
        while (hl.currentCharIdx < hl.sourceLen) {
          if (sourceHtml.substr(hl.currentCharIdx, 3) == '-->'
          || sourceHtml.substr(hl.currentCharIdx, 2) == '</')
            break;
          let c = sourceHtml[hl.currentCharIdx];
          if((c == '{') || (c == '}') || (c == ':') || (c == ';') || (c == '(') || (c == ')') || (c == ',') || (c == '!') || (c == '@') || (c == '{')) {
            hl.pushBufferIfNotEmpty();
            hl.bufferStartCharIdx = hl.currentCharIdx + 1;
            hl.result.push('<span class="m">' + sourceHtml[hl.currentCharIdx] + '</span>')
          }
          ++hl.currentCharIdx;
        }
        hl.pushBufferIfNotEmpty();
      
        //optional "-->"
        if (sourceHtml.substr(hl.currentCharIdx, 3) == '-->') {
          hl.result.push('<span class="c">--&gt;</span>');
          hl.currentCharIdx += 3; // "<!--"
        }
      }

      hl.pushLineBreakState = function(opening, closing) {
        hl.lineBreakState.push({ o: opening, c: closing });
        hl.result.push(opening);
      }
      
      hl.popLineBreakState = function() {
        hl.result.push(hl.lineBreakState.pop().c);
      }

      hl.addLineBreaks = function(string) {
        return string.replace(/\n/g, function (tag) { 
          let result = [];
          for (let i = hl.lineBreakState.length - 1; i >= 0; --i) result.push(hl.lineBreakState[i].c);
          result.push('</div><div class="line">');
          for (let i = 0; i < hl.lineBreakState.length; ++i) result.push(hl.lineBreakState[i].o);
          return result.join('');
        });
      }
        
      hl.skipWhiteSpaces = function() {
        hl.startAcummulatingBuffer();
        while(hl.currentCharIdx < hl.sourceLen) {
          let c = sourceHtml[hl.currentCharIdx];
          if ((c == ' ') || (c == '\n') || (c == '\t'))
            ++hl.currentCharIdx;
          else break;
        }
        hl.pushBufferIfNotEmpty();      
      };

      hl.startAcummulatingBuffer = function() {
        hl.bufferStartCharIdx = hl.currentCharIdx;
      };
        
      hl.getAcummulatedBuffer = function(defaultValue) {
        if (hl.currentCharIdx - hl.bufferStartCharIdx > 0)
          return hl.addLineBreaks(encodeHtmlEntities(sourceHtml.substr(hl.bufferStartCharIdx, hl.currentCharIdx - hl.bufferStartCharIdx)));
        else 
          return defaultValue;
      };
      
      hl.pushBufferIfNotEmpty = function() {
          if (hl.currentCharIdx - hl.bufferStartCharIdx > 0)
            hl.result.push(hl.addLineBreaks(encodeHtmlEntities(sourceHtml.substr(hl.bufferStartCharIdx, hl.currentCharIdx - hl.bufferStartCharIdx))));
      };
        
      return hl.doWork();
      
    } catch (e) { Stationery.handleException(e); return null; }
  },

  
}

function encodeHtmlEntities(string) {
  var tagsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  return string.replace(/[&<>]/g, function (tag) { return tagsToReplace[tag] || tag; });
}

function escapeFontFamily(fontFamily) {
  if (!(fontFamily == 'monospace' || fontFamily == 'serif' || fontFamily == 'sansserif'))
    fontFamily = '"' + fontFamily + '", monospace';
  return fontFamily;
}  
  
function getCSS(prefsBlock) {
  if (typeof prefsBlock !== 'object') return '';
  let css = [];
  if ('c' in prefsBlock) css.push('color:' + prefsBlock['c']);
  if ('bk' in prefsBlock) css.push('background-color:' + prefsBlock['bk']);
  if ('f' in prefsBlock) css.push('font-family:' + prefsBlock['f']);
  if ('fs' in prefsBlock) css.push('font-size:' + prefsBlock['fs'] + 'pt');
  if ('b' in prefsBlock) if (prefsBlock['b']) css.push('font-weight: bold');
  if ('i' in prefsBlock) if (prefsBlock['i']) css.push('font-style: italic');
  return css.join('; ');
}
