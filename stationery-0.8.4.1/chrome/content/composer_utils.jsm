/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: composer_utils.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: utility functions for composer window

******************************************************************************/

Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/iteratorUtils.jsm');
Components.utils.import("resource://gre/modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

var EXPORTED_SYMBOLS = [];

Stationery.definePreference('ApplyStationery_New', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_MailToUrl', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ForwardAsAttachment', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ForwardInline', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_NewsPost', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToSender', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToGroup', { type: 'bool', default: true } );
Stationery.definePreference('ApplyStationery_ReplyToSenderAndGroup', { type: 'bool', default: true } );

Stationery.extractMetaData = function(editor) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if((node.nodeName == 'META') && node.hasAttribute('name')) {

        let metaName = node.getAttribute('name');
        let metaContent = '';
        if(node.hasAttribute('content'))
          metaContent = node.getAttribute('content');
        
        result.all[metaName] = metaContent;
          
        if(metaName.match(/stationery-supressStandardSignature/i))
          result.supressStandardSignature = metaContent.match(/true/i);
      };

      if (node.hasChildNodes()) recurse(node.childNodes);
    }
  }
  
  try {
    let result = { 
      all: [],
      supressStandardSignature: false
    };
    recurse(editor.rootElement.parentNode.childNodes);
  } catch (e) {
    Stationery.handleException(e);
  }
  return result;
}



Stationery.cleanUpDomOfNewlyLoadedTemplate = function(editor) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];
      if ( 
        node.nodeName=="SCRIPT" ||
        node.nodeName=="BGSOUND" ||
        node.nodeName=="LINK" ||
        node.nodeName=="META" || 
        node.nodeName=="BASE" || 
        node.nodeName=="TITLE" ||
        (node.nodeName=="DIV" && node.hasAttribute("id") && node.id.match(/^imageholder$/i) && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i) && (!node.nodeValue || node.nodeValue.match(/^\s*$/i)) ) ||
        (node.nodeName=="TABLE" && node.hasAttribute("id") && node.id.match(/^imageholder$/i) && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i) ) ||
        (node.nodeName=="#comment" && node.nodeValue.match(/^webbot.*/i)) 
      ) {
        node.parentNode.removeChild(nodes[i--]); 
      }
    }
    
    for (let i = 0 ; i < nodes.length; i++) 
      if (nodes[i].hasChildNodes()) 
        recurse(nodes[i].childNodes);
  }    
  recurse(editor.rootElement.parentNode.childNodes);
}

Stationery.getTemplatePlaceholder = function(win, nodes, type) {
  if (!nodes) 
    return Stationery.getTemplatePlaceholder(win, win.GetCurrentEditor().rootElement.childNodes, type);

  for(let i = 0 ; i < nodes.length; i++) {
    let node = nodes[i];

    if((node.hasAttribute) && (node.getAttribute) && node.hasAttribute("stationery") && node.getAttribute("stationery") == type + "-placeholder")
      return node;

    if (node.hasChildNodes()) {
      node = Stationery.getTemplatePlaceholder(win, node.childNodes, type);
      if(node) return node;
    }
  }
  return null;
}

Stationery.setCaretPosition = function(win, nodes) { 
  try {
    let editor = win.GetCurrentEditor();
    let caretSpan = editor.rootElement.childNodes[0].ownerDocument.getElementById('_AthCaret');
    if (caretSpan) {
      editor.selection.collapse(caretSpan, 0);
      caretSpan.parentNode.removeChild(caretSpan);
    }
  } catch(e) {}
}

Stationery.getSignatureNode = function(editor) {

  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if((node.hasAttribute) && (node.getAttribute) 
        && node.hasAttribute("class") && node.getAttribute("class") == "moz-signature"
        && !node.hasAttribute("stationery")
      )
        return node;

      if (node.hasChildNodes() && node.nodeName != 'BLOCKQUOTE') {
        node = recurse(node.childNodes);
        if(node) return node;
      }
    }
    return null;
  }
  return recurse(editor.rootElement.childNodes);
}

Stationery.fixBlockquoteStyle = function(editor, nodes) {

  let id = '';
  if (!nodes) 
    nodes = editor.rootElement.childNodes;
  function updateCSSblock(node) {
    for (let i = 0 ; i < node.childNodes.length; i++) {
      let styleNode = node.childNodes[i];
      if (styleNode.nodeName=='STYLE') {
        let newContent = '';
        let rules = styleNode.sheet.cssRules;
        for(let r = 0; r < rules.length; r++)
        try { 
          newContent = newContent + id + ' ' 
            + rules[r].selectorText
              .replace(/body/igm, '') 
              .replace(id, ' ') 
              .replace(/,/igm, ",\n" + id) 
            + ' { ' + rules[r].style.cssText + " }\n";
        } catch (e) { }
        styleNode.textContent = newContent;
      }
      if (node.hasChildNodes() && (node.nodeName != 'BLOCKQUOTE')) 
        updateCSSblock(styleNode);
    }
  }


  for (let i = 0 ; i < nodes.length; i++) {
    let node = nodes[i];

    if (node.nodeName=='BLOCKQUOTE') {
      if(node.hasAttribute('id'))
        id = node.getAttribute('id');
      else
        if(node.hasAttribute('cite'))
          id = node.getAttribute('cite');
        else
          id = 'Cite_' + Math.floor((Math.random()*10000000));
      id = id.replace(/\W/g, '_')
      node.setAttribute('id', id);
      id = '#' + id; 
      updateCSSblock(node);
      Stationery.addClass(node, 'cite'); 
    }

    if (node.hasChildNodes()) 
      Stationery.fixBlockquoteStyle(editor, node.childNodes);
  }
}

Stationery.getCursorOffset = function (editor) {

  let cursorOffset = 0;
  
  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if(node.nodeType == node.TEXT_NODE) {
        if(node === editor.selection.focusNode) {
          cursorOffset += editor.selection.focusOffset;
          return true; 
        }
        cursorOffset += node.nodeValue.length;
      } else
        if(node === editor.selection.focusNode)
          return true; 
        
      if (node.hasChildNodes())
        if (recurse(node.childNodes)) return true;
    }
    return false;
  }

  if (recurse(editor.rootElement.childNodes)) return cursorOffset;
  return 0; 
}


Stationery.setCursorOffset = function (editor, offset) {

  let cursorOffset = offset;
  
  function recurse(nodes) {
    for (let i = 0 ; i < nodes.length; i++) {
      let node = nodes[i];

      if(node.nodeType == node.TEXT_NODE) {
        if(cursorOffset <= node.nodeValue.length) {
          let range = editor.document.createRange();
          range.setStart(node, cursorOffset);
          range.setEnd(node, cursorOffset);
          editor.selection.removeAllRanges();
          editor.selection.addRange(range);
          return true; 
        } else
          cursorOffset -= node.nodeValue.length;
      } else   
        if (node.hasChildNodes())
          if (recurse(node.childNodes)) return true;
    }
    return false;
  }
  
  recurse(editor.rootElement.childNodes)
}

Stationery.fixImagesPaths = function(htmlDocument) {
  let images = htmlDocument.getElementsByTagName('IMG');
  for (let i = 0 ; i < images.length; i++) {
    let node = images[i];
    if (node.hasAttribute('src')) {
      if (node.src.match(/mailbox:\/\/\/(.)(?:%7C|\|)\//i))
        node.src = node.src.replace(/mailbox:\/\/\/(.)(?:%7C|\|)\//i, 'mailbox:///$1%3A/');
        
      if (node.src.match(/file:\/\/\/(.)(?:%7C|\|)\//i)) 
        node.src = node.src.replace(/file:\/\/\/(.)(?:%7C|\|)\//i, 'file:///$1%3A/');
    }
  }  
}

function useFontPreview() {
  if (typeof useFontPreview.useFontPreview === "undefined")
    useFontPreview.useFontPreview = Stationery.fontEnumerator.EnumerateAllFonts({ value: 0 }).length < 300;
  return useFontPreview.useFontPreview;
}

function adjustAddressingWidget(wnd) {
  let linesNo = Stationery.getPref('AddresingWidgetLines');
  while (linesNo > 10) linesNo = linesNo / 10;

  let addressingWidget = wnd.document.getElementById('addressingWidget');
  let MsgHeadersToolbar = wnd.document.getElementById('MsgHeadersToolbar'); 

  let oneRowHeight = wnd.document.getElementById('addressCol1#1').parentNode.boxObject.height;
  let ExtraHeight = 2 + MsgHeadersToolbar.boxObject.height - addressingWidget.boxObject.element.clientHeight;
    
  MsgHeadersToolbar.removeAttribute('minheight');
  MsgHeadersToolbar.style.minHeight = '' + (oneRowHeight + ExtraHeight) + 'px';
  MsgHeadersToolbar.style.height =  '' + (oneRowHeight * linesNo + ExtraHeight) + 'px';
  MsgHeadersToolbar.height = oneRowHeight * linesNo + ExtraHeight;

  wnd.awCreateOrRemoveDummyRows();
}

Stationery.onComposeBodyReady = function(wnd) {
  try{
    wnd.Stationery_.OriginalContent = false;
    wnd.Stationery_.forceApplying = false;
    wnd.Stationery_.templateCanBeChanged = wnd.gMsgCompose.compFields.draftId == '';
      
    adjustAddressingWidget(wnd);
    wnd.Stationery_.ApplyTemplate();
    
    wnd.setTimeout(function() {
      wnd.document.getElementById('FontFaceSelect').setAttribute('maxwidth', 250);
      let FontFacePopup = wnd.document.getElementById('FontFacePopup')
      let nodes = FontFacePopup.childNodes;
        
      nodes[1].setAttribute('style', 'font-family: monospace !important;');
      nodes[3].setAttribute('style', 'font-family: Helvetica, Arial, sans-serif !important;');
      nodes[4].setAttribute('style', 'font-family: Times, serif !important;');
      nodes[5].setAttribute('style', 'font-family: Courier, monospace !important;');

      if (useFontPreview()) 
        for (let i = 7; i < nodes.length; ++i) {
          let n = nodes[i];
          n.setAttribute('style', 'font-family: "' + n.value + '" !important;');
          n.tooltipText = n.value;
        }
    }, 0);
  } catch (e) { Stationery.handleException(e); }
  
}

Stationery.plainText2HTML = function(text) {
  var tagsToReplace = { '\r\n': '<br>', '\r': '<br>', '\n': '<br>', '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  return text.replace(/\r\n|[\r\n&<>]/g, function (tag) { return tagsToReplace[tag] || tag; });
}

Stationery.HTML2PlainText = function(html) {
  let enc = Components.interfaces.nsIDocumentEncoder;
  return Stationery.parserUtils.convertToPlainText(html, 
    enc.OutputFormatted || 
    enc.OutputBodyOnly || 
    enc.OutputCRLineBreak ||
    end.OutputAbsoluteLinks ||
    0, 0);
}
