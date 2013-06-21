const WINDOW_LOADED = -1;
const WINDOW_CLOSED = -2;

const LOG_PREFIX = "[Tab Scope Tweaker] ";

Components.utils.import("resource://gre/modules/Services.jsm");

function install(params, reason) {
}
function uninstall(params, reason) {
}
function startup(params, reason) {
	tsTweaker.init(reason);
}
function shutdown(params, reason) {
	tsTweaker.destroy(reason);
}

var tsTweaker = {
	initialized: false,
	init: function(reason) {
		if(this.initialized)
			return;
		this.initialized = true;

		var ws = Services.wm.getEnumerator("navigator:browser");
		while(ws.hasMoreElements())
			this.initWindow(ws.getNext(), reason);
		Services.ww.registerNotification(this);
	},
	destroy: function(reason) {
		if(!this.initialized)
			return;
		this.initialized = false;

		var ws = Services.wm.getEnumerator("navigator:browser");
		while(ws.hasMoreElements())
			this.destroyWindow(ws.getNext(), reason);
		Services.ww.unregisterNotification(this);

		this.loadStyles(false);
	},

	observe: function(subject, topic, data) {
		if(topic == "domwindowopened")
			subject.addEventListener("load", this, false);
		else if(topic == "domwindowclosed")
			this.destroyWindow(subject, WINDOW_CLOSED);
	},
	handleEvent: function(e) {
		if(e.type == "load") {
			var window = e.originalTarget.defaultView;
			window.removeEventListener("load", this, false);
			this.initWindow(window, WINDOW_LOADED);
		}
	},

	initWindow: function(window, reason) {
		if(reason == WINDOW_LOADED && !this.isTargetWindow(window))
			return;
		window.setTimeout(function() {
			this.loadStyles(true);
			window.setTimeout(function() {
				this.tweakPanel(window, true);
				this.watchChanges(window, true);
			}.bind(this), 50);
		}.bind(this), 50);
	},
	destroyWindow: function(window, reason) {
		window.removeEventListener("load", this, false); // Window can be closed before "load"
		if(reason == WINDOW_CLOSED && !this.isTargetWindow(window))
			return;
		var force = reason != APP_SHUTDOWN && reason != WINDOW_CLOSED;
		force && this.tweakPanel(window, false);
		this.watchChanges(window, false);
	},
	isTargetWindow: function(window) {
		return window.document.documentElement.getAttribute("windowtype") == "navigator:browser";
	},

	_stylesLoaded: false,
	loadStyles: function(add) {
		if(!add ^ this._stylesLoaded)
			return;
		this._stylesLoaded = add;
		var cssURI = Services.io.newURI("chrome://tabscopetweaker/content/styles.css", null, null);
		this.loadSheet(cssURI, add);
	},
	get sss() {
		delete this.sss;
		return this.sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
			.getService(Components.interfaces.nsIStyleSheetService);
	},
	loadSheet: function(cssURI, load) {
		var sss = this.sss;
		if(!load ^ sss.sheetRegistered(cssURI, sss.USER_SHEET))
			return;
		if(load)
			sss.loadAndRegisterSheet(cssURI, sss.USER_SHEET);
		else
			sss.unregisterSheet(cssURI, sss.USER_SHEET);
	},

	tweakPanel: function(window, tweak) {
		var document = window.document;
		var tsTitle = document.getElementById("tabscope-title");
		var tsPanel = tsTitle.parentNode;
		if(tweak) {
			var tsUri = document.createElement("label");
			tsUri.id = "tabscope-uri";
			tsUri.setAttribute("crop", "center");
			//tsPanel.appendChild(tsUri);
			tsPanel.insertBefore(tsUri, tsTitle);

			tsTitle._tabScopeTweakerOrigCrop = tsTitle.hasAttribute("crop") && tsTitle.getAttribute("crop");
			tsTitle.setAttribute("crop", "center");

			tsTitle._tabScopeTweakerOrigPreviousSibling = tsTitle.previousSibling;
			tsTitle._tabScopeTweakerOrigNextSibling = tsTitle.nextSibling;
			tsPanel.insertBefore(tsTitle, tsPanel.firstChild);
		}
		else {
			var tsUri = document.getElementById("tabscope-uri");
			tsUri && tsUri.parentNode.removeChild(tsUri);

			var origCrop = tsTitle._tabScopeTweakerOrigCrop;
			delete tsTitle._tabScopeTweakerOrigCrop;
			if(origCrop === false)
				tsTitle.removeAttribute("crop");
			else
				tsTitle.setAttribute("crop", origCrop);

			var ps = tsTitle._tabScopeTweakerOrigPreviousSibling;
			var ns = tsTitle._tabScopeTweakerOrigNextSibling;
			delete tsTitle._tabScopeTweakerOrigPreviousSibling;
			delete tsTitle._tabScopeTweakerOrigNextSibling;
			if(ps && ps.parentNode)
				ps.parentNode.insertBefore(tsTitle, ps.nextSibling);
			else if(ns && ns.parentNode)
				ns.parentNode.insertBefore(tsTitle, ns);
			else { // Fallback
				ps = tsPanel.getElementsByTagName("stack")[0];
				if(ps)
					ps.parentNode.insertBefore(tsTitle, ps.nextSibling);
			}
		}
	},
	watchChanges: function(window, watch) {
		var tsTitle = window.document.getElementById("tabscope-title");
		if(watch) {
			var mo = new window.MutationObserver(this.handleMutationsFixed);
			mo.observe(tsTitle, {
				attributes: true,
				attributeFilter: ["value", "style"]
			});
			tsTitle._tabScopeTweakerMutationObserver = mo;
		}
		else {
			tsTitle._tabScopeTweakerMutationObserver.disconnect();
			delete tsTitle._tabScopeTweakerMutationObserver;
		}
	},

	get handleMutationsFixed() {
		delete this.handleMutationsFixed;
		return this.handleMutationsFixed = this.handleMutations.bind(this);
	},
	handleMutations: function(mutations) {
		this.updateUri(mutations[0].target);
	},
	updateUri: function(tsTitle) {
		var document = tsTitle.ownerDocument;
		var window = document.defaultView;
		var tsUri = document.getElementById("tabscope-uri");

		var w = tsTitle.style.width;
		var reset = w == "0px";
		var uri = "";
		if(
			!reset
			&& window.TabScope
			&& window.TabScope._tab
			&& window.TabScope._tab.linkedBrowser
		)
			uri = window.losslessDecodeURI(window.TabScope._tab.linkedBrowser.currentURI);
		tsUri.value = tsUri.tooltipText = uri;
		tsUri.style.width = w;
	}
};