/******************************************************************************
project: "Stationery" extension for Thunderbird
filename: menu.jsm
author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
description: handle dynamic menu creation and update
  
******************************************************************************/
'use strict';


Components.utils.import('resource://stationery/content/stationery.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/iteratorUtils.jsm');
Components.utils.import('resource://gre/modules/mailServices.js');
Components.utils.import('resource://gre/modules/XPCOMUtils.jsm');

var EXPORTED_SYMBOLS = [];

Stationery.definePreference('AttachMenu_3paneWrite', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3paneForward', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3panehdrReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_3panehdrForward', { type: 'bool', default: true } );

Stationery.definePreference('AttachMenu_MsgViewWrite', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewReplyAll', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewForward', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewhdrReply', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_MsgViewhdrForward', { type: 'bool', default: true } );

Stationery.definePreference('AttachMenu_StationeryOptions', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_ComposerChangeStationery', { type: 'bool', default: true } );
Stationery.definePreference('AttachMenu_ComposerStationeryToolbutton', { type: 'bool', default: true } );

let prefObserver = Stationery.registerPreferenceObserver('', {
  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIObserver, Components.interfaces.nsISupportsWeakReference]),
  observe: function(aSubject, aTopic, aData) {
    if (aData.match(/AttachMenu_/)) updateAllStationeryMenus();
  }
}, true);


Stationery.modules['menu'] = {
  windowLoaded: function(win) {
    if (Stationery.isMessengerWindow(win)) {
      win.document.getElementById('taskPopup').addEventListener('popupshowing', updateStationeryOptionsMenuItem, false);
    }

    if (Stationery.isMessengerWindow(win) || Stationery.isMessageWindow(win) || Stationery.isComposerWindow(win)) {
      win.document.documentElement.appendChild(Stationery.makeElement(win.document, 'tooltip', {
        id: 'stationery-menu-tooltip',
        events: [
          {name: 'popupshowing', value: Stationery.templates.onTemplateMenuitemTooltipShowing }
        ],
      }));
    }
    
    if (Stationery.isMessengerWindow(win) || Stationery.isMessageWindow(win)) {
      win.setInterval(function() { sanitizeToolbarBecauseOfCompactHeaderExtension(win) }, 1000);
      
      initializeStationeryMenu(win, 'button-newmsg');
      initializeStationeryMenu(win, 'button-reply');
      initializeStationeryMenu(win, 'button-replyall');
      initializeStationeryMenu(win, 'button-forward');
      
      initializeStationeryMenu(win, 'hdrReplyButton');
      initializeStationeryMenu(win, 'hdrReplyOnlyButton');
      initializeStationeryMenu(win, 'hdrReplyAllButton');
      initializeStationeryMenu(win, 'hdrReplyListButton');
      initializeStationeryMenu(win, 'hdrReplyToSenderButton');
      initializeStationeryMenu(win, 'hdrForwardButton');
    }
    
    if (Stationery.isComposerWindow(win)) {
      initializeStationeryMenu(win, 'msgComposeContext'); 
      initializeStationeryMenu(win, 'composeToolbar2'); 
    }
  },  

};

Stationery.updateMenusInWindow = function(win) {
  allAllStationeryBaseId.forEach(function (id) { 
    try {
      updateStationeryMenu(win, id) 
    } catch(e){ Stationery.handleException(e); }
  })
};



function sanitizeToolbarBecauseOfCompactHeaderExtension(win) {
  try {
    let headeToolbar = win.document.getElementById('header-view-toolbar');
    if (!headeToolbar) return;
    for (let i = 0; i < headeToolbar.childNodes.length; ++i) {
      let toolbarbutton = headeToolbar.childNodes[i];
      if (toolbarbutton.hasAttribute('id')) {
        let id = toolbarbutton.getAttribute('id');

        if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
         || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton')
          toolbarbutton.removeAttribute('collapsed');
        
        if (id=='button-newmsg' || id=='button-reply' || id=='button-forward' || id=='button-replyall' || id=='button-replylist')
          toolbarbutton.parentNode.removeChild(toolbarbutton);
      }
    }
  } catch (e) { Stationery.handleException(e); }
}

function updateStationeryOptionsMenuItem(event) {
  try { 
    let doc = null;
    if (event.target)
      doc = event.target.ownerDocument;
    else
      if (event.view && event.view.document) 
        doc = event.view.document;
    if (!doc) return;
    let menu = doc.getElementById('stationery-options');
    if (!menu) return;
    if (Stationery.getPref('AttachMenu_StationeryOptions')) 
      menu.removeAttribute('hidden');
    else
      menu.setAttribute('hidden', 'true');
  } catch(e){ Stationery.handleException(e); }
}



function findMenupopup(element) {
  if (!element || !element.childNodes) return false;
  let nodes = element.childNodes;
  for (let i = 0; i < nodes.length; ++i)
    if (nodes[i].nodeName == 'menupopup') 
      return nodes[i];
  return false;
}

function findOrMakeMenupopup(element) {
  if (!element || !element.childNodes) return false;
  let nodes = element.childNodes;
  for (let i = 0; i < nodes.length; ++i)
    if (nodes[i].nodeName == 'menupopup') 
      return nodes[i];
  let r = Stationery.makeElement(element, 'menupopup');
  element.appendChild(r);
  return r;
}

Stationery.makeElement = function(doc, elementName, v) {
  if (!('createElement' in doc)) doc = doc.ownerDocument; 
  return Stationery.setupElement(doc.createElement('' + elementName), v);
}

Stationery.setupElement = function(element, v) {
  v = v || {};
  if ('id' in v) element.setAttribute('id', v['id']);
  if ('label' in v) element.setAttribute('label', v['label']);

  if ('tooltip' in v) element.tooltipText = v['tooltip'];

  if ('class' in v) Stationery.addClass(element, v['class']);

  
  if ('attr' in v) for (let a in fixIterator(v['attr'])) {
    if ('remove' in a) element.removeAttribute(a.name);
    if ('value' in a) element.setAttribute(a.name, a.value);
  }
  if ('events' in v) for (let e in fixIterator(v['events'])) element.addEventListener(e.name, e.value, 'useCapture' in e ? e.useCapture : false );
  
  return element;
}

Stationery.enableOrDisableElement = function(element, state) {
  if (state) element.removeAttribute('disabled');
  else       element.setAttribute('disabled', 'true');
}

Stationery.installToolbarButton = function(doc, toolbarId, id, before) {
  if (!doc.getElementById(id)) {
    let toolbar = doc.getElementById(toolbarId);

    let a = toolbar.currentSet.split(',');
    let i = before == null ? -1 : a.indexOf(before);
    if (i >= 0) a.splice(i, 1, id); else a.push(id);
    toolbar.currentSet = a.join(',');
    toolbar.setAttribute('currentset', toolbar.currentSet);
    doc.persist(toolbar.id, 'currentset');
  }
}

Stationery.removeToolbarButton = function(doc, toolbarId, id) {
  if (doc.getElementById(id)) {
    let toolbar = doc.getElementById(toolbarId);
    
    let a = toolbar.currentSet.split(',');
    let i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1);
    toolbar.currentSet = a.join(',');
    toolbar.setAttribute('currentset', toolbar.currentSet);
    doc.persist(toolbar.id, 'currentset');
  }
}


function menupopupHaveOneNonStationeryItem(menupopup, id) {
  let nodes = menupopup.childNodes;
  let r = new RegExp('stationery-' + id + '-.*');
  for (let i=0; i < nodes.length;++i) {
    let node = nodes[i];
    if (node.hasAttribute('stationery-menuitem')) continue;
    if (node.hasAttribute('id') && !node.getAttribute('id').match(r)) 
      return true;
  }
  return false;
}

let windowType2PrefId = { 
  'mail:messageWindow': 'MsgView',
  'mail:3pane': '3pane',
  'msgcompose': 'Composer',
};

let IdToPrefId = {
  'button-newmsg': 'Write',
  'button-reply': 'Reply',
  'button-replyall': 'ReplyAll',
  'button-forward': 'Forward',
  'hdrReplyButton': 'hdrReply',
  'hdrReplyOnlyButton': 'hdrReply',
  'hdrReplyAllButton': 'hdrReply',
  'hdrReplyListButton': 'hdrReply',
  'hdrReplyToSenderButton': 'hdrReply',
  'hdrForwardButton': 'hdrForward',
  'msgComposeContext': 'ChangeStationery',
  'composeToolbar2': 'StationeryToolbutton',
  
};


let allWindowTypes = ['mail:3pane', 'msgcompose', 'mail:messageWindow'];
let allAllStationeryBaseId = [
  'button-newmsg', 'button-reply', 'button-replyall', 'button-forward', 'msgComposeContext', 'composeToolbar2',
  'hdrReplyButton', 'hdrReplyOnlyButton', 'hdrReplyAllButton', 'hdrReplyListButton', 'hdrReplyToSenderButton', 'hdrForwardButton'
];


function shouldAttachMenu(win, id) {
  return true == Stationery.getPref('AttachMenu_' + windowType2PrefId[Stationery.getWindowType(win)] + IdToPrefId[id]);
}

function initializeStationeryMenu(win, id) {
  try {
    let doc = win.document;
    let givenObject = doc.getElementById(id);
    if (!givenObject) return; 

    let topSeparator = Stationery.makeElement(doc, 'menuseparator', {
      id: 'stationery-' + id + '-separator-top'
    });
    
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      let menupopup = findOrMakeMenupopup(givenObject);
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
      menupopup.appendChild(topSeparator);
    }

    if (id=='msgComposeContext') {
      givenObject.addEventListener('popupshowing', onStationeryMenuParentPopup, false);
      givenObject.setAttribute('stationery-related-id', id);
      let subMenu = Stationery.makeElement(doc, 'menu', {
        id: 'stationery-' + id + '-folder', 
        label: Stationery._('composerEditorPopup.changeStationery'), 
      });
      let menupopup = findOrMakeMenupopup(subMenu);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
      givenObject.appendChild(topSeparator);
      givenObject.appendChild(subMenu);
    }
    
    if (id=='composeToolbar2') {
      let button = doc.getElementById('stationery-composer-change-stationery');
      if (!button) { 
        button = givenObject.parentNode.palette.querySelector('#stationery-composer-change-stationery');
      }
      let menupopup = findOrMakeMenupopup(button);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton' ) {
      let parentMenupopup = findOrMakeMenupopup(givenObject);
      parentMenupopup.addEventListener('popupshowing', onStationeryMenuParentPopup, false);
      parentMenupopup.setAttribute('stationery-related-id', id);
      let subMenu = Stationery.makeElement(doc, 'menu', {
        id: 'stationery-' + id + '-folder', 
        label: Stationery._('menu.stationerySubmenu.label'), 
      });
      let menupopup = findOrMakeMenupopup(subMenu);
      menupopup.setAttribute('id', 'stationery-' + id + '-menupopup');
      menupopup.addEventListener('popupshowing', onStationeryMenuPopup, false);
      menupopup.setAttribute('stationery-related-id', id);
      parentMenupopup.appendChild(topSeparator);
      parentMenupopup.appendChild(subMenu);
    }
   
  } catch (e) { Stationery.handleException(e); }
  updateStationeryMenu(win, id);
}

let updateAllStationeryMenusTimer = Stationery.makeTimer();
function updateAllStationeryMenus() {
  updateAllStationeryMenusTimer.startTimeout(function () { 
    allWindowTypes.forEach(function (winType) {
      for (let win in fixIterator(Services.wm.getEnumerator(winType), Components.interfaces.nsIDOMWindow))         
        allAllStationeryBaseId.forEach(function (id) { 
          try {
            updateStationeryMenu(win, id) 
          } catch(e){ Stationery.handleException(e); }
        })
    })
  }, 500); 
}

let delayedupdateStationeryMenuTimer = Stationery.makeTimer();

function updateStationeryMenu(win, id) {
  try {
    let doc = win.document;
    let givenObject = doc.getElementById(id);
    if (!givenObject) return; 

    let topSeparator = Stationery.makeElement(doc, 'menuseparator', {
      id: 'stationery-' + id + '-separator-top'
    });
    
    let showStationeryMenu = shouldAttachMenu(win, id); 
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      let haveOneNonStationeryItem = menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);

      if (showStationeryMenu || haveOneNonStationeryItem) {
        givenObject.setAttribute('type', 'menu-button');
        if (!givenObject.hasAttribute('oncommand')) {
          if (id=='button-reply') Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgReplyMessage(event)'}]});
          if (id=='button-replyall') Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgReplyToAllMessage(event)'}]});
          if (id=='button-forward') Stationery.setupElement(givenObject, { attr: [{name: 'oncommand', value: 'MsgForwardMessage(event)'}]});
        }
        
      } else 
        givenObject.removeAttribute('type');
      
      if (topSeparator) topSeparator.setAttribute('collapsed', showStationeryMenu && haveOneNonStationeryItem ? 'false' : 'true');
      
    }

    if (id=='msgComposeContext') {
      let subMenu = doc.getElementById('stationery-' + id + '-folder');
      if (subMenu) subMenu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      if (topSeparator) topSeparator.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
    }

    if (id=='composeToolbar2') {
      if (showStationeryMenu) {
        Stationery.installToolbarButton(doc, id, 'stationery-composer-change-stationery');
        if ('templateCanBeChanged' in win.Stationery_) {
          let btn = doc.getElementById('stationery-composer-change-stationery');
          if (btn) Stationery.enableOrDisableElement(btn, win.gMsgCompose.composeHTML && win.Stationery_.templateCanBeChanged);
        } else {
          delayedupdateStationeryMenuTimer.startTimeout(function () { updateStationeryMenu(win, id); }, 500); 
        }
      } else
        Stationery.removeToolbarButton(doc, id, 'stationery-composer-change-stationery');
        
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton' ) {
      
      let haveOneNonStationeryItem = menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);
      
      if (showStationeryMenu || haveOneNonStationeryItem)
        givenObject.setAttribute('type', 'menu-button');
      else 
        givenObject.removeAttribute('type');
      
      let subMenu = doc.getElementById('stationery-' + id + '-folder');
      if (subMenu) subMenu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      if (topSeparator) topSeparator.setAttribute('collapsed', showStationeryMenu && haveOneNonStationeryItem ? 'false' : 'true');
    }
   
  } catch (e) { Stationery.handleException(e); }
}

function onStationeryMenuParentPopup(event) {
  try {
    let win = event.view;
    let id = event.target.getAttribute('stationery-related-id');
    let doc = win.document; 
    let givenObject = win.document.getElementById(id);
    if (!givenObject) return; //no XUL element, bail out.

    if (id=='msgComposeContext') {
      let menupopup = doc.getElementById('stationery-' + id + '-menupopup');
      let showStationeryMenu = shouldAttachMenu(win, id) && win.gMsgCompose.composeHTML && win.Stationery_.templateCanBeChanged; 
      var menu = doc.getElementById('stationery-' + id + '-folder');
      if (menu) menu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      menu = doc.getElementById('stationery-' + id + '-separator-top');
      if (menu) menu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      return; 
    }
    
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton') {
      let menupopup = doc.getElementById('stationery-' + id + '-menupopup');
      let showStationeryMenu = shouldAttachMenu(win, id);
      let showTopSeparator = showStationeryMenu && menupopupHaveOneNonStationeryItem(findMenupopup(givenObject), id);
      var menu = doc.getElementById('stationery-' + id + '-folder');
      if (menu) menu.setAttribute('collapsed', showStationeryMenu ? 'false' : 'true');
      menu = doc.getElementById('stationery-' + id + '-separator-top');
      if (menu) menu.setAttribute('collapsed', showTopSeparator ? 'false' : 'true');
      
      return; 
    }
      
  } catch (e) { Stationery.handleException(e); }
}


function onStationeryMenuPopup(event) {
  try {
    let win = event.view;
    let identityKey = Stationery.templates.getIdentityKey(win);
    let id = event.target.getAttribute('stationery-related-id');
    let doc = win.document;
    
    let givenObject = win.document.getElementById(id);
    if (!givenObject) return;
    
    let menupopup = null;
    let showTopSeparator = false;
    
    if (id=='button-newmsg' || id=='button-reply' || id=='button-replyall' || id=='button-forward') {
      menupopup = findMenupopup(givenObject);
      showTopSeparator = menupopupHaveOneNonStationeryItem(menupopup, id);
    }
    if (id=='msgComposeContext' || id=='composeToolbar2') {
      menupopup = doc.getElementById('stationery-' + id + '-menupopup');
    }
    if (id=='hdrReplyButton' || id=='hdrReplyOnlyButton' || id=='hdrReplyAllButton' 
     || id=='hdrReplyListButton' || id=='hdrReplyToSenderButton' || id=='hdrForwardButton') {
      menupopup = doc.getElementById('stationery-' + id + '-menupopup');
    }
    if (!menupopup) return;
    let menu = doc.getElementById('stationery-' + id + '-separator-top');
    if (menu) menu.setAttribute('collapsed', String(!showTopSeparator));
    let nodesToDelete = givenObject.querySelectorAll('[stationery-menuitem]');
    for (let i = 0; i < nodesToDelete.length; ++i)
      nodesToDelete[i].parentNode.removeChild(nodesToDelete[i]);
    for (let template in Stationery.templates.getTemplatesIterator(identityKey))
      menupopup.appendChild(Stationery.makeElement(doc, 'menuitem', {
        label: template.name,
        attr: [
          {name: 'stationery-menuitem', value: 'true'},
          {name: 'stationery-template', value: template.uid },
          {name: 'stationery-related-id', value: id },
          {name: 'tooltip', value: 'stationery-menu-tooltip' },
        ],
        events: [
          {name: 'command', value: Stationery.templates.onTemplateMenuitemCommand }
        ],
      }));
    menupopup.appendChild(Stationery.makeElement(doc, 'menuseparator', {
      attr: [ {name: 'stationery-menuitem', value: 'true'} ]
    }));
    for (let menuitem in Stationery.templates.getHandlerMenuitemIterator(doc)) {
      menupopup.appendChild(Stationery.setupElement(menuitem, {
        attr: [
          {name: 'stationery-menuitem', value: 'true'},
          {name: 'stationery-identity-key', value: identityKey },
          {name: 'stationery-related-id', value: id },
        ],
      }) );
    }
  } catch (e) { Stationery.handleException(e); }
}

