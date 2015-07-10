/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: stationery-composer.js
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: This is JS file for composer window. 
******************************************************************************/

Components.utils.import('resource://gre/modules/iteratorUtils.jsm');
Components.utils.import('resource://gre/modules/mailServices.js');
Components.utils.import('resource://gre/modules/Services.jsm');


Stationery_.gSourceEditorJSCommandControllerID = false;
Stationery_.getSourceEditorCommandTable = function() {
  let SourceContentWindow = document.getElementById('stationery-content-source').contentWindow;
  let controller;
  if (Stationery_.gSourceEditorJSCommandControllerID)
    try { 
      controller = SourceContentWindow.controllers.getControllerById(Stationery_.gSourceEditorJSCommandControllerID);
    } catch (e) {}

  if (!controller)
  {
    //create it
    controller = Components.classes['@mozilla.org/embedcomp/base-command-controller;1'].createInstance();

    let editorController = controller.QueryInterface(Components.interfaces.nsIControllerContext);
    editorController.init(null);
    editorController.setCommandContext(SourceContentWindow);
    SourceContentWindow.controllers.insertControllerAt(0, controller);
  
    // Store the controller ID so we can be sure to get the right one later
    Stationery_.gSourceEditorJSCommandControllerID = SourceContentWindow.controllers.getControllerId(controller);
  }

  if (controller)
    return controller.QueryInterface(Components.interfaces.nsIInterfaceRequestor).getInterface(Components.interfaces.nsIControllerCommandTable);
  return null;
}

Stationery_.nsFindInSourceCommand = {
  isCommandEnabled: function(aCommand, editorElement) { return true; },

  getCommandStateParams: function(aCommand, aParams, editorElement) {},
  doCommandParams: function(aCommand, aParams, editorElement) {},

  doCommand: function(aCommand, editorElement) {
    document.getElementById('stationery-content-source-findbar').onFindCommand();
  }
};

Stationery_.nsFindAgainInSourceCommand = {
  isCommandEnabled: function(aCommand, editorElement) {
    // we can only do this if the search pattern is non-empty. 
    let findbar = document.getElementById('stationery-content-source-findbar');
    return !findbar.hidden && findbar._findField.value;
  },

  getCommandStateParams: function(aCommand, aParams, editorElement) {},
  doCommandParams: function(aCommand, aParams, editorElement) {},

  doCommand: function(aCommand, editorElement) {
    document.getElementById('stationery-content-source-findbar').onFindAgainCommand(aCommand == 'cmd_findPrev');
  }
};

Stationery_.OrginalGenericSendMessage = GenericSendMessage;
GenericSendMessage = function(msgType) {
  try {
    //synchronize WYSIWYG editor to Source editor, if currently user edit source.
    if(document.getElementById('stationery-content-tab').selectedIndex != 0) Stationery_.SelectEditMode(0, true);
  } catch (ex) {}
  Stationery_.OrginalGenericSendMessage(msgType);
}


Stationery_.MsgComposeCloseWindow = MsgComposeCloseWindow;
MsgComposeCloseWindow = function(recycleIt) {
  if(recycleIt) try {
  
    //clear pending timeouts
    try { Stationery_.edObs.functionTimer.cancel(); } catch (e) {}
    try { Stationery_.WYSIWYGEdEditObs.functionTimer.cancel(); } catch (e) {}

    //remove edit listeners
    let WYSIWYGEd = document.getElementById('content-frame');
    try {
       WYSIWYGEd.getEditor(WYSIWYGEd.contentWindow).removeEditActionListener(Stationery_.WYSIWYGEdEditObs);
    } catch(e) {}
    
    let srcEd = document.getElementById('stationery-content-source');
    srcEd = srcEd.getEditor(srcEd.contentWindow);
    try {
      srcEd.removeEditActionListener(Stationery_.edObs);
    } catch(e) {}

    //delete content in HTML source editor
    srcEd.rebuildDocumentFromSource('');
    
    //Switch WYSYWIG / Source tab to WYSYWIG mode.
    Stationery_.SelectEditMode(0, false);
    
  } catch (ex) {}
  Stationery_.MsgComposeCloseWindow(recycleIt);
}


Stationery_.ApplyTemplate = function() {
  try {
    document.getElementById('stationery-content-tab').selectedIndex = 0; //switch back to WYSIWYG tab

    //reset states...
    Stationery_.WYSIWYG_State = false;
    Stationery_.Source_State = false;
    //clear pending timeouts
    try { Stationery_.edObs.functionTimer.cancel(); } catch (e) {}
    try { Stationery_.WYSIWYGEdEditObs.functionTimer.cancel(); } catch (e) {}

    //always make src editor editable, in plaintext it will be used to convert HTML to plain
    let srcEd = document.getElementById('stationery-content-source');
    srcEd.makeEditable('text', false);
    srcEd = srcEd.getEditor(srcEd.contentWindow);
    srcEd.setSpellcheckUserOverride(false);    

    
    //prepare my overlay of composer to show HTML Source if needed.
    if (gMsgCompose.composeHTML && Stationery.getPref('SourceEditEnabled')) {
      document.getElementById('stationery-content-tab').removeAttribute('collapsed');
      Stationery_.edObs.working = false;
      srcEd.addEditActionListener(Stationery_.edObs);
    } else
      document.getElementById('stationery-content-tab').setAttribute('collapsed', 'true');
    
    //do NOT apply stationery when when user open saved message (from drafts or templates)
    if (gMsgCompose.compFields.draftId) return;
        
        
    //do NOT apply stationery when automatic applying for this message type is not allowed, 
    //but always apply if change of template was forced (from context menu)
    let mct = Components.interfaces.nsIMsgCompType;
    let applyStationery = (arguments.length > 0 && arguments[0]) ||
        (gMsgCompose.type == mct.New && Stationery.getPref('ApplyStationery_New')) ||
        (gMsgCompose.type == mct.MailToUrl && Stationery.getPref('ApplyStationery_MailToUrl')) ||
        (gMsgCompose.type == mct.Reply && Stationery.getPref('ApplyStationery_ReplyToSender')) ||
        (gMsgCompose.type == mct.ReplyToSender && Stationery.getPref('ApplyStationery_ReplyToSender')) ||
        (gMsgCompose.type == mct.ReplyAll && Stationery.getPref('ApplyStationery_ReplyAll')) ||
        (gMsgCompose.type == mct.ForwardAsAttachment && Stationery.getPref('ApplyStationery_ForwardAsAttachment')) ||
        (gMsgCompose.type == mct.ForwardInline && Stationery.getPref('ApplyStationery_ForwardInline')) ||
        (gMsgCompose.type == mct.NewsPost && Stationery.getPref('ApplyStationery_NewsPost')) ||
        (gMsgCompose.type == mct.ReplyToGroup && Stationery.getPref('ApplyStationery_ReplyToGroup')) ||
        (gMsgCompose.type == mct.ReplyToSenderAndGroup && Stationery.getPref('ApplyStationery_ReplyToSenderAndGroup')) ;
    if (!applyStationery) return;

    
    let identityKey = Stationery.templates.getIdentityKey(window);
    Stationery_.currentTemplate = Stationery.templates.getCurrent(identityKey);
    
    //important: strong compare to "false" value!
    if (Stationery_.OriginalContent === false) { //on first applying Stationery_.OriginalContent is false. 
      Stationery.fireEvent(window, 'template-loading');

      if (gMsgCompose.composeHTML) Stationery.fixBlockquoteStyle(window.GetCurrentEditor());
    
      Stationery_.OriginalContent = gMsgCompose.editor.rootElement.innerHTML;
      if (Stationery_.OriginalContent == '<br>') Stationery_.OriginalContent = ''; //editor adds one <br> if there is no content
    } else {
      Stationery.fireEvent(window, 'template-reloading');
    }
    
    if (gMsgCompose.composeHTML)
      Stationery_.ApplyHTMLTemplate(); 
/*    else
      Stationery_.ApplyPlainTemplate();*/
      
    Stationery.fireEvent(window, 'template-loaded');
      
    SetContentAndBodyAsUnmodified();
    //clear undo buffer
    gMsgCompose.editor.enableUndo(false);
    gMsgCompose.editor.enableUndo(true);    
      
  } catch (e) { Stationery.handleException(e); }
}


Stationery_.GetCurrentSourceHTMLState = function() {
  let ed = document.getElementById('stationery-content-source');
  return ed.getHTMLEditor(ed.contentWindow).getModificationCount();
}
      
Stationery_.SelectEditMode = function(mode, syncOnly) {
//modes: 0 - WYSIWYG, 1- HTML source
  try {
    if (window.gMsgCompose == null) return;//function called when composer window is not constructed completly yet, just after overlay loads
    
    //copy HTML from WYSIWYG to source, only when WYSIWYG is changed from last time. in other case leave source HTML untouched, user may do fixes manually
    if (mode == 1) {
      //note: strong compare is required!
      if (Stationery_.WYSIWYG_State !== window.GetCurrentEditor().getModificationCount()) {
        Stationery_.MoveContentFromWYSIWYGtoSource(window);
        Stationery_.WYSIWYG_State = window.GetCurrentEditor().getModificationCount();
        Stationery_.Source_State = Stationery_.GetCurrentSourceHTMLState();
      }
        
      //switch panes
      if(!syncOnly) window.document.getElementById('stationery-content-source-box').removeAttribute('collapsed');
      if(!syncOnly) window.document.getElementById('content-frame').setAttribute('collapsed', true);
    }
        
      
    // user switches back to WYSIWYG, only when source is changed from last time. in other case leave WYSIWYG untouched
    if (mode == 0) {
      //note: strong compare is required!
      if (Stationery_.Source_State !== Stationery_.GetCurrentSourceHTMLState()) {
        Stationery_.MoveContentFromSourceToWYSIWYG(window);
        Stationery_.Source_State = Stationery_.GetCurrentSourceHTMLState();
        Stationery_.WYSIWYG_State = window.GetCurrentEditor().getModificationCount();
      }
      //switch panes
      if(!syncOnly) window.document.getElementById('stationery-content-source-box').setAttribute('collapsed', true);
      if(!syncOnly) window.document.getElementById('content-frame').removeAttribute('collapsed');
    }

    //switch panes
//    if(!syncOnly) { window.document.getElementById('stationery-editors').selectedIndex = mode;

  } catch (e) { Stationery.handleException(e); }
}

Stationery_.MoveContentFromSourceToWYSIWYG = function() {
  //window.gMsgCompose.editor.beginTransaction();
  try{
    let ed = window.document.getElementById('stationery-content-source');
    
    window.gMsgCompose.editor.QueryInterface(Components.interfaces.nsIHTMLEditor).rebuildDocumentFromSource(Stationery.syntax.getClearHtml(
//      ed.getHTMLEditor(ed.contentWindow).outputToString('text/plain', 131600 /* OutputPreformatted | OutputCRLineBreak | OutputPersistNBSP */ )
      ed.getHTMLEditor(ed.contentWindow).outputToString('text/plain', 16 /* OutputPreformatted */ )
        
    ));

  } catch (e) { Stationery.handleException(e); }
  //window.gMsgCompose.editor.endTransaction();
}


Stationery_.MoveContentFromWYSIWYGtoSource = function() {
  try{
    let ed = window.document.getElementById('stationery-content-source');
    let htmled = ed.getHTMLEditor(ed.contentWindow);
    
    //note: Surprisingly, most time in syntax re-applying takes to remove old nodes. if body is clear, then 
    //assigning innerHTML is much faster. 
    //Note2: deleting <body> child nodes one by one is soo slow... replacing whole body with its empty clone is two times faster!
    let bodyElement = htmled.rootElement;     
    bodyElement.parentNode.replaceChild(bodyElement.cloneNode(false), bodyElement);    
    
    //replace <head> contents while <body> is empty, to minimize overhead
    htmled.replaceHeadContentsWithHTML(Stationery.syntax.getStyleBlock());
    //set new <body> contents
    htmled.rootElement.innerHTML = Stationery.syntax.getBody("<html>\n" + window.GetCurrentEditor().rootElement.parentNode.innerHTML + "\n</html>");
    
  } catch (e) { Stationery.handleException(e); }
}

Stationery_.ApplyPlainTemplate = function() {
return;
/*  
//todo: new way to assemble text template and reply

when we have source HTML in SrcEd, then we can 
 * get all metadata required (stationery options)
 * apply some of this options 
   (note: for citation placeholder and signature placeholder we must put in text only 
    some kind of unique tags (making sute they do not exists in text)
   we replace such tags to mix template text with reply and sig already existing 
   in primary editor.
   
important: primary editor node with style="white-space: pre;", must get addictional 
atribute _moz_quote="true". this is special atribute to mark this node as cited content.

if loaded template does not have placeholders for cite or sig, then we should always 
insert template before signature.
if there is no signature (gCurrentIdentity.attachSignature is false) then we should insert 
content according to gCurrentIdentity rules (.replyOnTop => on top, else on bottom)
  
  
*/
/*  
  if (html) { // correctly loaded Stationery template
    //use source text editor to convert html to plain text.
//todo: use Stationery.HTML2PlainText  instead!!    
    let SrcEd = document.getElementById('stationery-content-source');
    SrcEd = SrcEd.getHTMLEditor(SrcEd.contentWindow);
    SrcEd.rebuildDocumentFromSource(html.replace(/\r/g, ''));
    
    //extract all stationery options from metadata
    //Stationery_.CurrentTemplateMeta = Stationery.extractMetaData(SrcEd) ;

    //replace HTML placeholders with pure text placeholders
    
    //get template as plain text.
    let plainText = SrcEd.outputToString('text/plain', 0).replace(/\r/g, '');

    plainTextEditor.beginTransaction();
    try { 
      //clear editor
      plainTextEditor.selectAll();
      plainTextEditor.deleteSelection(plainTextEditor.eNone);

      //insert content, obeing user prefs
      if (gCurrentIdentity.replyOnTop) {
        plainTextEditor.insertText(plainText);
        HTMLEditor.insertHTML(Stationery_.OriginalContent);

        //scroll to top, moving selection
        //HTMLEditor.selectionController.completeScroll(false);
        HTMLEditor.selectionController.completeMove(false, false);
        
      } else {
        //bottom posting, 
        if (!gCurrentIdentity.attachSignature) {
          HTMLEditor.insertHTML(Stationery_.OriginalContent);
          plainTextEditor.insertText(plainText);
          
          //scroll to end, moving selection
          //HTMLEditor.selectionController.completeScroll(true);
          HTMLEditor.selectionController.completeMove(true, false);
          
        } else {
          //break content to sig and cite
          let sigPos = Stationery_.OriginalContent.lastIndexOf("-- ");
          if (sigPos == -1) {
            HTMLEditor.insertHTML(Stationery_.OriginalContent);
            plainTextEditor.insertText(plainText);
          } else {
            HTMLEditor.insertHTML(Stationery_.OriginalContent.substring(0, sigPos)) //cite;
            plainTextEditor.insertText(plainText);
            HTMLEditor.insertHTML(Stationery_.OriginalContent.substring(sigPos, Stationery_.OriginalContent.length)); //signature
          }
        }
      }
      
      let nodes = plainTextEditor.rootElement.childNodes;
      for(let i = 0 ; i < nodes.length; i++) {
        let node = nodes[i];
        if(node.hasAttribute && node.hasAttribute('style') && node.getAttribute('style').match(/white-space: pre;/))
          node.setAttribute('_moz_quote', 'true');
      }
      
    } finally {
      plainTextEditor.endTransaction();
    }
  }*/
  
}


Stationery_.ApplyHTMLTemplate = function() {

  let template = Stationery_.currentTemplate;
  let HTMLEditor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIHTMLEditor);

  if(template.type == 'blank') {
    gMsgCompose.editor.beginTransaction();
    try {
      HTMLEditor.rebuildDocumentFromSource('<html><body>' + Stationery_.OriginalContent + '</body></html>');
      loadHTMLMsgPrefs();
      return;
    } finally {
      gMsgCompose.editor.endTransaction();
    }          
  }

  if (!Stationery.templates.load(window, template)) return; // error
    
  try { 
    gMsgCompose.editor.beginTransaction();
    let html = '';
    if ('HTML' in template) 
      html = template.HTML;
    else 
      if ('Text' in template)
        html = Stationery.plainText2HTML(template.Text);
            
    HTMLEditor.rebuildDocumentFromSource(html);
    
    //todo: gather metadata before cleaning!
    Stationery.cleanUpDomOfNewlyLoadedTemplate(HTMLEditor);
    
    Stationery.templates.postprocess(template, HTMLEditor, gMsgCompose, Stationery_);
        
    
    //place content in placeholder if it exists
    let placeholder = Stationery.getTemplatePlaceholder(window, null, 'content');
    if (!placeholder) {
      //if none found, just add dummy at end of template
      placeholder = window.GetCurrentEditor().rootElement.ownerDocument.createElement('div');
      window.GetCurrentEditor().rootElement.appendChild(placeholder);
    }  
    let converter = placeholder.ownerDocument.createElement('div');
    converter.innerHTML = Stationery_.OriginalContent;
    while (converter.childNodes.length > 0)
      placeholder.parentNode.insertBefore(converter.childNodes[0], placeholder); 
    delete converter;
    placeholder.parentNode.removeChild(placeholder); 
    
    //place signature in placeholder if it exists.
    placeholder = Stationery.getTemplatePlaceholder(window, null, 'signature');
    if(placeholder) {
      //clear placeholder prior to searching for signature node
      //this should prevent error in case when there is signature-like preview in placeholder node.
      //replaceChild: fastest way to clear
      let old_placeholder = placeholder;
      placeholder = old_placeholder.cloneNode(false);
      old_placeholder.parentNode.replaceChild(placeholder, old_placeholder); 

      let signatureNode = Stationery.getSignatureNode(window.GetCurrentEditor());
//todo: check for case when placeholder is inside found signatureNode
//or better ignore such signature-like nodes
      if (signatureNode)
        placeholder.parentNode.replaceChild(signatureNode, placeholder);
      else // remove signature placeholder if not used
        placeholder.parentNode.removeChild(placeholder);
    }

    //move focus point to top of page
    let selectionController = gMsgCompose.editor.selectionController;
    selectionController.completeScroll(false);
    
    //setup caret position. it may update selection
    Stationery.setCaretPosition(window, null);
    
    //finally, scroll current selection into view
    selectionController.scrollSelectionIntoView(
      selectionController.SELECTION_NORMAL,
      selectionController.SELECTION_FOCUS_REGION,
      true
    );
  } finally {
    gMsgCompose.editor.endTransaction();
  }
}


//hijack stateListener.NotifyComposeBodyReady as good point to apply template
//adding my own listener is meaningless, because it will be registred before stateListener, 
//hence stateListener still can broke template in loadHTMLMsgPrefs()
stateListener.orgNotifyComposeBodyReady = stateListener.NotifyComposeBodyReady;
stateListener.NotifyComposeBodyReady = function () {
  stateListener.orgNotifyComposeBodyReady();

  Stationery.onComposeBodyReady(window);
  
  //obserwer to fix some images in WYSIWYG mode 
  //should run even if remplate is not applied
  let WYSIWYGEd = document.getElementById('content-frame');
  WYSIWYGEd = WYSIWYGEd.getEditor(WYSIWYGEd.contentWindow);
  try { 
    Stationery.fixImagesPaths(WYSIWYGEd.rootElement.ownerDocument);
  } catch (e) { Stationery.handleException(e); }
  //first try to remove... make sure it is registred only once
  try {
    WYSIWYGEd.removeEditActionListener(Stationery_.WYSIWYGEdEditObs);
  } catch(e) {}
  //then add listener.
  Stationery_.WYSIWYGEdEditObs.working = false;
  WYSIWYGEd.addEditActionListener(Stationery_.WYSIWYGEdEditObs);
}

//DOMContentLoaded ??
window.addEventListener('load', function(event) {
  try {
    
  
    let commandTable = Stationery_.getSourceEditorCommandTable();
    commandTable.registerCommand('cmd_find',     Stationery_.nsFindInSourceCommand);
    commandTable.registerCommand('cmd_findNext', Stationery_.nsFindAgainInSourceCommand);
    commandTable.registerCommand('cmd_findPrev', Stationery_.nsFindAgainInSourceCommand);
    
//pref: AttachMenu_ComposerStationeryToolbutton
//todo: install it in 'load' when pref set.
//todo: change pref if user add/remove it manually
//todo: install/uninstall when pref value is changed
    
    document.getElementById('msgcomposeWindow').addEventListener('compose-from-changed', Stationery_.onIdentityChanged, false);    

    //when message is saved or send, disable ability to change template. It is too late anyway.
    document.getElementById('msgcomposeWindow').addEventListener('compose-send-message', function(event) {
      event.view.Stationery_.templateCanBeChanged = false;
      Stationery.updateMenusInWindow(event.view);
    }, false);    
    
  } catch (e) {
    Stationery.handleException(e);
  }
}, false);

Stationery_.onIdentityChanged = function(event) {
  if (!Stationery_.templateCanBeChanged || !Stationery.getPref('ChangeTemplateWithIdentity')) return;
  try {
    if (gMsgCompose.bodyModified && Stationery.getPref('ChangeTemplateWithIdentityConfirmation')) {
      let checkbox = { value: false };
      if (!Services.prompt.confirmCheck(event.view, 
        Stationery._('changeConfirmation.windowTitle'),
        Stationery._('changeTemplateWithIdentityConfirmation.description'), 
        Stationery._('changeConfirmation.label'), 
        checkbox
      )) {
        //cancelled
        return;
      }
      Stationery.setPref('ChangeTemplateWithIdentityConfirmation', !checkbox.value);
    }
    
    //TODO: handle signature!!!
    
    Stationery_.ApplyTemplate();
    
  } catch (e) {
    Stationery.handleException(e);
  }
}

Stationery_.edObstimeout_function = function() {
  let ed = document.getElementById('stationery-content-source');
  let htmled = ed.getHTMLEditor(ed.contentWindow);
  
  let cursorOffset = Stationery.getCursorOffset(htmled);
  
  if(cursorOffset == 0 //unable to discover cursor pos
    || !htmled.selection.isCollapsed //user selected some part of test, applying syntax will break his action
  )
    return;
    
  let html = Stationery.syntax.getBody(htmled.outputToString('text/plain', 16 /* OutputPreformatted */));
  if (!html) return;
  try {
    Stationery_.edObs.working = true;
    htmled.beginTransaction();

    //note: Surprisingly, most time in syntax re-applying takes to remove old nodes. if body is clear, then 
    //assigning innerHTML is much faster. 
    //Note2: deleting <body> child nodes one by one is soo slow... replacing whole body with its empty clone is much faster!
    let bodyElement = htmled.rootElement;     
    bodyElement.parentNode.replaceChild(bodyElement.cloneNode(false), bodyElement);    
    
    //replace <head> contents while <body> is empty, to minimize overhead
    htmled.replaceHeadContentsWithHTML(Stationery.syntax.getStyleBlock());
    //set new <body> contents
    htmled.rootElement.innerHTML = html;

    //todo: make this faster...
    Stationery.setCursorOffset(htmled, cursorOffset)
  } finally {
    htmled.endTransaction();
    Stationery_.edObs.working = false;
  }
  
}

Stationery_.edObs = {
  // nsISupports
  QueryInterface: function (aIID) {
    if (aIID.equals(Components.interfaces.nsIEditActionListener) || aIID.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
  functionTimer: Stationery.makeTimer(),
  working: false,
  
  Action: function ( ) {
    try { Stationery_.edObs.functionTimer.cancel(); } catch (e) {}
    if (this.working) return;
    Stationery_.edObs.functionTimer.startTimeout(Stationery_.edObstimeout_function, 5000);
  },  
  // nsIEditActionListener
  DidCreateNode: function ( /*DOMString*/ tag , /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position ) { },
  DidDeleteNode: function ( /*nsIDOMNode*/ child) { },
  DidDeleteSelection: function ( /*nsISelection*/ selection ) { this.Action(); },
  DidDeleteText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*PRInt32*/ length) { this.Action(); },
  DidInsertNode: function ( /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position) {  },
  DidInsertText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*DOMString*/ string) { this.Action(); },
  DidJoinNodes: function ( /*nsIDOMNode*/ leftNode , /*nsIDOMNode*/ rightNode , /*nsIDOMNode*/ parent) {  },
  DidSplitNode: function ( /*nsIDOMNode*/ existingRightNode , /*PRInt32*/ offset , /*nsIDOMNode*/ newLeftNode) {  },
  WillCreateNode: function ( /*DOMString*/ tag , /*nsIDOMNode*/ parent , /*PRInt32*/ position)  {  },
  WillDeleteNode: function ( /*nsIDOMNode*/ child ) {  },
  WillDeleteSelection: function ( /*nsISelection*/ selection ) {  },
  WillDeleteText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*PRInt32*/ length ) {  },
  WillInsertNode: function ( /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position ) {  },
  WillInsertText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*DOMString*/ string ) {  },
  WillJoinNodes: function ( /*nsIDOMNode*/ leftNode , /*nsIDOMNode*/ rightNode , /*nsIDOMNode*/ parent ) {  },
  WillSplitNode: function ( /*nsIDOMNode*/ existingRightNode , /*PRInt32*/ offset ) {  }
}

Stationery_.WYSIWYGObstimeout_function = function() {
  let ed = document.getElementById('content-frame');
  let htmled = ed.getHTMLEditor(ed.contentWindow);

  Stationery_.WYSIWYGEdEditObs.working = true;
  htmled.beginTransaction();
  try {
    Stationery.fixImagesPaths(htmled.rootElement.ownerDocument);
  } finally {
    htmled.endTransaction();
    Stationery_.WYSIWYGEdEditObs.working = false;
  }
}

Stationery_.WYSIWYGEdEditObs = {
  // nsISupports
  QueryInterface: function (aIID) {
    if (aIID.equals(Components.interfaces.nsIEditActionListener) || aIID.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  functionTimer: Stationery.makeTimer(),
  working: false,
    
  // nsIEditActionListener
  DidCreateNode: function ( /*DOMString*/ tag , /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position ) { },
  DidDeleteNode: function ( /*nsIDOMNode*/ child) { },
  DidDeleteSelection: function ( /*nsISelection*/ selection ) { },
  DidDeleteText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*PRInt32*/ length) { },
  DidInsertNode: function ( /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position) {
    try { Stationery_.WYSIWYGEdEditObs.functionTimer.cancel(); } catch (e) {}
    if (this.working) return;
    Stationery_.WYSIWYGEdEditObs.functionTimer.startTimeout(Stationery_.WYSIWYGObstimeout_function, 100);
  },
  DidInsertText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*DOMString*/ string) { },
  DidJoinNodes: function ( /*nsIDOMNode*/ leftNode , /*nsIDOMNode*/ rightNode , /*nsIDOMNode*/ parent) { },
  DidSplitNode: function ( /*nsIDOMNode*/ existingRightNode , /*PRInt32*/ offset , /*nsIDOMNode*/ newLeftNode) { },
  WillCreateNode: function ( /*DOMString*/ tag , /*nsIDOMNode*/ parent , /*PRInt32*/ position)  { },
  WillDeleteNode: function ( /*nsIDOMNode*/ child ) { },
  WillDeleteSelection: function ( /*nsISelection*/ selection ) { },
  WillDeleteText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*PRInt32*/ length ) { },
  WillInsertNode: function ( /*nsIDOMNode*/ node , /*nsIDOMNode*/ parent , /*PRInt32*/ position ) { },
  WillInsertText: function ( /*nsIDOMCharacterData*/ textNode , /*PRInt32*/ offset , /*DOMString*/ string ) { },
  WillJoinNodes: function ( /*nsIDOMNode*/ leftNode , /*nsIDOMNode*/ rightNode , /*nsIDOMNode*/ parent ) { },
  WillSplitNode: function ( /*nsIDOMNode*/ existingRightNode , /*PRInt32*/ offset ) { }
}


/* 
  this function override and bypass default HTML-to-plaintext degradation if HTML is very simple.
  such degradation sometimes broke HTML messages, especiallly messages with a lot of CSS used.
  this function replace oryginal function.
*/
function DetermineConvertibility() {
  if (gMsgCompose.composeHTML) return nsIMsgCompConvertible.No;
  return nsIMsgCompConvertible.Plain;
}

/*
function LoadIdentity(startup) {

    var identityElement = document.getElementById("msgIdentity");
    
    if (identityElement) {
        var idKey = identityElement.value;
        gCurrentIdentity = MailServices.accounts.getIdentity(idKey);

          try {
            gMsgCompose.identity = gCurrentIdentity;
          } catch (ex) { dump("### Cannot change the identity: " + ex + "\n");}
    }
}
*/
