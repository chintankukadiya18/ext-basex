/* global Ext */
/*
 * ext-basex 3.3
 * ***********************************************************************************
 *
 * Ext.lib.Ajax enhancements: 
 * - adds EventManager Support to Ext.lib.Ajax (if Ext.util.Observable is present in the stack) 
 * - adds Synchronous Ajax Support ( options.async =false ) 
 * - Permits IE to Access Local File Systems using IE's older ActiveX interface via the forceActiveX property 
 * - Pluggable Form encoder (encodeURIComponent is still the default encoder) 
 * - Corrects the Content-Type Headers for posting JSON (application/json) and XML (text/xml)
 *   data payloads and sets only one value (per RFC) 
 * - Adds fullStatus:{ isLocal, proxied, isOK, isError, isTimeout, isAbort, error, status, statusText} object
 *   to the existing Response Object. 
 * - Adds standard HTTP Auth support to every request (XHR userId, password config options) 
 * - options.method prevails over any method derived by the lib.Ajax stack (DELETE, PUT, HEAD etc). 
 * - Adds named-Priority-Queuing for Ajax Requests 
 * - adds Script=Tag support for foreign-domains (proxied:true) with configurable callbacks. 
 * - Adds final features for $JIT support.
 * 
 * - Adds Browser capabilities object reporting on presence of (SVG, Canvas, Flash, Cookies, XPath )
 *    if(Ext.capabilities.hasFlash){ ... }
 * - Adds Ext.overload supported for parameter-based overloading of Function and class methods.
 * - Adds Ext.clone functions for any datatype.
 * - Adds Array prototype features: first, last, clone, forEach, atRandom, include, flatten, compact, unique, filter, map
 * - Connection/response object members : getAllResponseHeaders, getResponseHeader are now functions.
 * - Adds Array.slice support for other browsers (Gecko already supports it)
 *    @example:  Array.slice( someArray, 2 )
 * - Adds Ext[isFunction, isObject, isDocument, isElement, isEvent]  methods.
 * - Adds Ext.isEventSupported('resize'[, forElement]) to determine if the browser supports a specific event.
 *    
 * ***********************************************************************************
 * Author: Doug Hendricks. doug[always-At]theactivegroup.com Copyright
 * 2007-2009, Active Group, Inc. All rights reserved.
 * ***********************************************************************************
 *
 * License: ext-basex is licensed under the terms of : GNU Open Source GPL 3.0
  *
 * Commercial use is prohibited without a Developer License, see:
 * http://licensing.theactivegroup.com.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see < http://www.gnu.org/licenses/gpl.html>.
 *
 * Donations are welcomed: http://donate.theactivegroup.com
 *
 */

(function() {
    var A = Ext.lib.Ajax;

    A.Queue = function(config) {

        config = config ? (config.name ? config : { name : config }) : {};
        Ext.apply(this, config, {
            name : 'q-default',
            priority : 5,
            FIFO : true, // false implies LIFO
            callback : null, // optional callback when queue is emptied
            scope : null, // scope of callback
            suspended : false,
            progressive : false // if true, one queue item is dispatched per poll interval

            });
        this.requests = new Array();
        this.pending = false;
        // assert/resolve to 0-9
        this.priority = this.priority > 9 ? 9 : (this.priority < 0 ? 0 : this.priority);
    };

    Ext.extend(A.Queue, Object, {
       /**
        * Adds Ext.lib.Ajax.request arguments to queue
        * @param {Array} request An array of request method arguments.
        *
        */
        add : function(req) {

            var permit = A.events ? A.fireEvent('beforequeue', this, req) : true;
            if (permit !== false) {
                this.requests.push(req);
                this.pending = true;
                A.pendingRequests++;
                this.manager && this.manager.start();
            }
        },
        
       /**
        * @property {Boolean} suspended Indicate the suspense state of the queue.
        */
        suspended : false,
        /**
         * @property {Object} activeRequest A reference to current/last active request.
         */
        activeRequest : null,
        
       /**
        * Selects the next item on the queue stack
        * @param {Boolean} peek If true, the queue item is returned but not removed from the stack.
        * @ default false
        */
        next : function(peek) {
            var req = peek ?
                this.requests[this.FIFO ? 'first' : 'last']()
               :this.requests[this.FIFO ? 'shift' : 'pop']();

            if (this.requests.length == 0) {
                // queue emptied callback
                this.pending = false;
                Ext.isFunction(this.callback) && this.callback.call(this.scope || null, this);
                A.events && A.fireEvent('queueempty', this);
            }
            return req || null;
        },

        /**
        * clear the queue of any remaining (pending) requests
        */
        clear : function() {
            this.suspend();
            A.pendingRequests -= this.requests.length;
            this.requests.length = 0;
            this.pending = false;
            this.resume();
            this.next(); //force the empty callback/event

        },
        
        /**
        * Suspend queue further queue dispatches of any remaining (pending) requests until the {@link #Ext.ux.ModuleManager-resume} method is called.
        */
        suspend : function() {
            this.suspended = true;
        },
        
        /** Resume from a suspended state */
        resume : function() {
            this.suspended = false;
        },
        
        /**
        * Dispatches the next queue item and initiates a Ext.lib.Ajax request on the result.
        * @param {Boolean} peek If true, the queue item is returned but not removed from the stack.
        * @return activeRequest
        */
        requestNext : function(peek) {
            var req;
            this.activeRequest = null;
            if (!this.suspended && (req = this.next(peek))) {
                if(req.active){  //was it aborted
                    this.activeRequest = A.request.apply(A,req);
                    A.pendingRequests--;
                } else {
                    return this.requestNext(peek);
                }
            }
            return this.activeRequest;
        }
    });

    A.QueueManager = function(config) {

        Ext.apply(this, config || {}, {
                    quantas : 10, // adjustable milliseconds deferred dispatch
                                    // value
                    priorityQueues : new Array(new Array(), new Array(),
                            new Array(), new Array(), new Array(), new Array(),
                            new Array(), new Array(), new Array(), new Array()), // iterable
                                                                                    // array
                                                                                    // (0-9)
                                                                                    // of
                                                                                    // prioritized
                                                                                    // queues:
                    queues : {}
                });
    };

    Ext.extend(A.QueueManager, Object, {

        
       /**
        * @cfg {Integer} quantas Adjustable milliseconds deferred dispatch timer interval
        */
        quantas : 10,
        
       /** Return a named queue reference
        * param {String} name The name of the desired queue.
        * @return Ext.lib.Ajax.Queue
        */
        getQueue : function(name) {
            return this.queues[name];
        },

        createQueue : function(config) {
            if (!config) {
                return null;
            }

            var q = new A.Queue(config);
            q.manager = this;
            this.queues[q.name] = q;

            var pqa = this.priorityQueues[q.priority];
            pqa && pqa.indexOf(q.name) == -1 && pqa.push(q.name);
            return q;
        },
       /** Remove a Queue by passed name or Queue Object reference
        * @param {String/Ext.lib.Ajax.Queue} queue
        */
        removeQueue : function(q) {
            if (q && (q = this.getQueue(q.name || q))) {
                q.clear(); // purge any pending requests
                this.priorityQueues[q.priority].remove(q.name);
                delete this.queues[q.name];
            }
        },
        
        /** @private */
        start : function() {
            if (!this.started) {
                this.started = true;
                this.dispatch();
            }
            return this;
        },

        /** Suspends all defined queues */
        suspendAll : function() {
            forEach(this.queues, function(Q) { Q.suspend(); });
        },
        
        /** Resumes all suspended queues */
        resumeAll : function() {
            forEach(this.queues, function(Q) { Q.resume();  });
            this.start();
        },

        /**
         * @cfg (Boolean) progressive Default Dispatch mode for all defined queues<p>
         * a false value will exhaust a priority queue until empty during dispatch (sequential) <p>
         * true to dispatch a single request from each priority queue until all queues exhausted.<p>This
         * option may be set on the Queue itself as well.
         * @default false
         */
        progressive : false,

        stop : function() {
            this.started = false;
            return this;
        },

        /** private
         * main Request dispatch loop. This keeps the maximum allowed number of
         * requests going at any one time (based on defined queue priority and
         * dispatch mode (see progressive).
         */

        dispatch   : function(){
            var qm = this, qmq = qm.queues;
            var quit=(A.activeRequests > A.maxConcurrentRequests);
            while(A.pendingRequests && !quit){

               var disp = function(qName) {
                    var q = qmq[qName], AR;

                    while (q && !q.suspended && q.pending && q.requestNext()) {

                        quit || (quit = A.activeRequests > A.maxConcurrentRequests);
                        if(quit)break;

                        // progressive, take the first one off each queue only
                        if (q.progressive || qm.progressive) { break;}

                     }
                     // keep going?
                     if(quit)return false;
                };

                Ext.each(this.priorityQueues, function(pqueue) {
                    // pqueue == array of queue names
                    !!pqueue.length && Ext.each(pqueue , disp, this);
                    quit || (quit = A.activeRequests > A.maxConcurrentRequests);
                    if(quit)return false;
                }, this);

            }

            if(A.pendingRequests || quit){
                this.dispatch.defer(this.quantas, this);
            } else{
                this.stop();
            }
        }
    });

    Ext.apply(A, {
        
        headers           : A.headers || {},
        defaultPostHeader : A.defaultPostHeader || 'application/x-www-form-urlencoded; charset=UTF-8',
        defaultHeaders    : A.defaultHeaders || {},
        useDefaultXhrHeader  : !!A.useDefaultXhrHeader, 
        defaultXhrHeader  : 'Ext.basex',
        
        pollInterval      : A.pollInterval || 50,
        
        queueManager      : new A.QueueManager(),

        // If true (or queue config object) ALL requests are queued
        queueAll : false,

        // the Current number of active Ajax requests.
        activeRequests : 0,

        // the Current number of pending Queued requests.
        pendingRequests : 0,

        /**
         * @property maxConcurrentRequests 
         * Specify the maximum allowed during concurrent Queued browser (XHR) requests
         */
        maxConcurrentRequests : Ext.isIE ? Ext.value(window.maxConnectionsPerServer, 2) : 4,

        /** set True as needed, to coerce IE to use older ActiveX interface 
         */
        forceActiveX : false,

        /**
         *  Global default may be toggled at any time 
         */
        async : true,
        
        /** private */
        createXhrObject : function(transactionId) {
            var obj = {
                status : {
                    isError : false
                },
                tId : transactionId
            }, http;
            try {
                if (!!this.forceActiveX) {
                    throw ("IE7forceActiveX");
                }
                obj.conn = new XMLHttpRequest();
            } catch (eo) {
                for (var i = 0; i < this.activeX.length; ++i) {
                    try {
                        obj.conn = new ActiveXObject(this.activeX[i]);
                        break;
                    } catch (e) {
                    }
                }
            } finally {
                obj.status.isError = typeof(obj.conn) == 'undefined';
            }
            return obj;

        },

        /* Replaceable Form encoder */

        encoder : encodeURIComponent,

        serializeForm : function(form) {
            var fElements = form.elements || (document.forms[form] || Ext.getDom(form)).elements,
                        hasSubmit = false,
                        encoder = this.encoder,
                        element,
                        options,
                        name,
                        val,
                        data = '',
                        type;
            Ext.each(fElements, function(element) {
                name = element.name;
                type = element.type;
                if (!element.disabled && name){
                    if(/select-(one|multiple)/i.test(type)){
                        Ext.each(element.options, function(opt) {
                            if (opt.selected) {
                                data += String.format("{0}={1}&",
                                     encoder(name),
                                     (opt.hasAttribute ? opt.hasAttribute('value') : opt.getAttribute('value') !== null) ? opt.value : opt.text);
                            }
                        });
                    } else if(!/file|undefined|reset|button/i.test(type)) {
                        if(!(/radio|checkbox/i.test(type) && !element.checked) && !(type == 'submit' && hasSubmit)){
                            data += encoder(name) + '=' + encoder(element.value) + '&';
                            hasSubmit = /submit/i.test(type);
                        }
                    }
                }
            });
            return data.substr(0, data.length - 1);

        },
        
        /** private */
        getHttpStatus : function(reqObj) {

            var statObj = {
                status : 0,
                statusText : '',
                isError : false,
                isLocal : false,
                isOK : false,
                error : null,
                isAbort : false,
                isTimeout : false
            };

            try {
                if (!reqObj) { throw ('noobj'); }
                statObj.status = reqObj.status;
                statObj.readyState = reqObj.readyState;
                statObj.isLocal = (!reqObj.status && location.protocol == "file:")
                        || (Ext.isSafari && reqObj.status === undefined);

                statObj.isOK = (statObj.isLocal || (statObj.status == 304
                        || statObj.status == 1223 || (statObj.status > 199 && statObj.status < 300)));

                statObj.statusText = reqObj.statusText || '';
            } catch (e) {
            } // status may not avail/valid yet (or called too early).

            return statObj;

        },
        /**
         * @private
         */
        handleTransactionResponse : function(o, callback, isAbort, isTimeout) {

            callback = callback || {};
            var responseObject = null;
            A.activeRequests--;

            if (!o.status.isError) {
                o.status = this.getHttpStatus(o.conn);
                /*
                 * create and enhance the response with proper status and XMLDOM
                 * if necessary
                 */
                responseObject = this.createResponseObject(o, callback.argument, isAbort);
            }


            /*
             * checked again in case exception was raised - ActiveX was
             * disabled during XML-DOM creation? And mixin everything the
             * XHR object had to offer as well
             */
             o.status.isError && (responseObject = Ext.apply({}, responseObject || {},
                        this.createExceptionObject(o.tId, callback.argument,
                          (isAbort? isAbort: false), isTimeout)));

            responseObject.options = o.options;
            responseObject.fullStatus = o.status;

            if (!this.events
                    || this.fireEvent('status:' + o.status.status,
                            o.status.status, o, responseObject, callback,
                            isAbort) !== false) {

                if (o.status.isOK && !o.status.isError) {
                    if (!this.events
                            || this.fireEvent('response', o, responseObject,
                                    callback, isAbort, isTimeout) !== false) {
                        if (callback.success) {
                            callback.success.call(callback.scope || null,responseObject);
                        }
                    }
                } else {
                    if (!this.events
                            || this.fireEvent('exception', o, responseObject,
                                    callback, isAbort, isTimeout) !== false) {
                        if (callback.failure) {
                            callback.failure.call(callback.scope || null, responseObject);
                        }
                    }
                }
            }

            this.releaseObject(o);
            if (o.options.async) {responseObject = null;} 
            else { return responseObject; }

        },

        /**
         *  replace with a custom JSON decoder/validator if required 
         */
        decodeJSON : Ext.decode,

        /**
         * @cfg reCtypeJSON
         * regexp test pattern applied to incoming response Content-Type header
         * to identify a potential JSON response. The default pattern handles
         * either text/json or application/json
         */
        reCtypeJSON : /(application|text)\/json/i,
        
         /** private */
        createResponseObject : function(o, callbackArg, isAbort, isTimeout) {
            var obj = {
                responseXML : null,
                responseText : '',
                responseStream : null,
                responseJSON : null,
                getResponseHeader : Ext.emptyFn,
                getAllResponseHeaders : Ext.emptyFn
            };

            var headerObj = {}, headerStr = '';

            if (isAbort !== true) {
                try { // to catch bad encoding problems here
                    obj.responseText = o.conn.responseText;
                    obj.responseStream = o.conn.responseStream || null;
                } catch (e) {
                    o.status.isError = true;
                    o.status.error = e;
                }

                try {
                    obj.responseXML = o.conn.responseXML || null;
                } catch (ex) {
                }

                try {
                    headerStr = o.conn.getAllResponseHeaders() || '';
                } catch (ex1) {
                }

                if ((o.status.isLocal || o.proxied)
                        && typeof obj.responseText == 'string') {

                    o.status.isOK = !o.status.isError
                            && ((o.status.status = (!!obj.responseText.length)
                                    ? 200
                                    : 404) == 200);

                    if (o.status.isOK
                            && (!obj.responseXML || (obj.responseXML && obj.responseXML.childNodes.length === 0))) {

                        var xdoc = null;
                        try { // ActiveX may be disabled
                            if (window.ActiveXObject) {
                                xdoc = new ActiveXObject("MSXML2.DOMDocument.3.0");
                                xdoc.async = false;

                                xdoc.loadXML(obj.responseText);
                            } else {
                                var domParser = null;
                                try { // Opera 9 will fail parsing non-XML
                                        // content, so trap here.
                                    domParser = new DOMParser();
                                    xdoc = domParser.parseFromString(obj.responseText,'application\/xml');
                                } catch (exP) {
                                } finally {
                                    domParser = null;
                                }
                            }
                        } catch (exd) {
                            o.status.isError = true;
                            o.status.error = exd;
                        }
                        obj.responseXML = xdoc;
                    }
                    if (obj.responseXML) {
                        var parseBad = (obj.responseXML.documentElement && obj.responseXML.documentElement.nodeName == 'parsererror')
                                || (obj.responseXML.parseError || 0) !== 0
                                || obj.responseXML.childNodes.length === 0;
                        if (!parseBad) {
                            headerStr = 'Content-Type: '
                                    + (obj.responseXML.contentType || 'text\/xml')
                                    + '\n' + headerStr;
                        }
                    }
                }

                var header = headerStr.split('\n');
                for (var i = 0; i < header.length; i++) {
                    var delimitPos = header[i].indexOf(':');
                    delimitPos != -1 && 
                        (headerObj[header[i].substring(0, delimitPos)] = header[i]
                                .substring(delimitPos + 2));
                    
                }

                if (o.options.isJSON || (this.reCtypeJSON && this.reCtypeJSON .test(headerObj['Content-Type'] || ""))) {
                    try {
                        obj.responseJSON = Ext.isFunction( this.decodeJSON )
                                ? this.decodeJSON(obj.responseText)
                                : null;
                    } catch (exJSON) {

                        o.status.isError = true; // trigger future exception
                                                    // callback
                        o.status.error = exJSON;
                    }
                }

            } // isAbort?
            o.status.proxied = !!o.proxied;

            Ext.apply(obj, {
                        tId     : o.tId,
                        status  : o.status.status,
                        statusText : o.status.statusText,
                        getResponseHeader : function(header){return headerObj[header];},
                        getAllResponseHeaders : function(){return headerStr},
                        fullStatus : o.status
                    });

            typeof callbackArg != 'undefined' && (obj.argument = callbackArg);
            return obj;
        },
        
        
        setDefaultPostHeader : function(contentType) {
            this.defaultPostHeader = contentType||'';
        },
        
        /**
         * Toggle use of the DefaultXhrHeader ('Ext.basex') 
         */
        setDefaultXhrHeader : function(bool) {
            this.useDefaultXhrHeader = bool || false;
        },

        request : function(method, uri, cb, data, options) {

            var O = options = Ext.apply({
                        async : this.async || false,
                        headers : false,
                        userId : null,
                        password : null,
                        xmlData : null,
                        jsonData : null,
                        queue : null,
                        proxied : false
                    }, options || {});

            /*/ Auto Proxy (JSONP) detection for foreign-domain:port
            if (!options.proxied) {
                var r = /^(?:\w+:)?\/\/([^\/?#]+)/;
                options.proxied = r.test(uri) && r.exec(uri)[1] != location.host;
            }*/

            if (!this.events
                    || this.fireEvent('request', method, uri, cb, data, O) !== false) {

                // Named priority queues
                if (!O.queued && (O.queue || (O.queue = this.queueAll || null)) ) {

                    O.queue === true && (O.queue = {name:'q-default'});
                    var oq = O.queue;
                    var qname = oq.name || oq , qm = this.queueManager;

                    var q = qm.getQueue(qname) || qm.createQueue(oq);
                    O.queue = q;
                    O.queued = true;

                    var req = [method, uri, cb, data, O];
                    req.active = true;
                    q.add(req);

                    return {
                        tId : this.transactionId++,
                        queued : true,
                        request : req,
                        options : O
                    };
                }
                
                O.headers && forEach(O.headers, function(value, key) { this.initHeader(key, value, false); });
                
                var cType;
                if (cType = (this.headers ? this.headers['Content-Type'] || null : null)) {
                    // remove to ensure only ONE is passed later.(per RFC)
                    delete this.headers['Content-Type'];
                }
                if (O.xmlData) {
                    cType || (cType = 'text/xml');
                    method = 'POST';
                    data = O.xmlData;
                } else if (O.jsonData) {
                    cType || (cType = 'application/json; charset=utf-8');
                    method = 'POST';
                    data = Ext.isObject(O.jsonData) ? Ext.encode(O.jsonData) : O.jsonData;
                }
                if (data) {
                    cType || (cType = this.useDefaultHeader
                                    ? this.defaultPostHeader
                                    : null);
                    cType && this.initHeader('Content-Type', cType, false);
                }

                // options.method prevails over any derived method.
                return this.makeRequest(O.method || method, uri, cb, data, O);
            }
            return null;

        },
        
        
        /** private */
        getConnectionObject : function(uri, options) {
            var o, f, e = Ext.emptyFn;
            var tId = this.transactionId;
            options || (options = {});
            try {
                if (f = options.proxied) { /* JSONP scriptTag Support */

                    o = {
                        tId : tId,
                        status : {},
                        proxied : true,
                        // synthesize an XHR object
                        conn : {
                            el : null,
                            send : function() {
                                var doc = (f.target || window).document, 
                                head = doc.getElementsByTagName("head")[0];
                                if (head && this.el) {
                                    head.appendChild(this.el);
                                }
                            },
                            abort : function() {
                                this.readyState = 0;
                            },
                            setRequestHeader : e,
                            getAllResponseHeaders : e,
                            getResponseHeader : e,
                            onreadystatechange : null,
                            readyState : 0,
                            status : 0,
                            responseText : null,
                            responseXML : null
                        },
                        debug : f.debug,
                        params : options.params || {},
                        cbName : f.callbackName || 'basexCallback' + tId,
                        cbParam : f.callbackParam || null
                    };

                    window[o.cbName] = o.cb = function(content, request) {

                        if (content && typeof content == 'object') {
                            this.responseJSON = content;
                            this.responseText = Ext.encode(content);
                        } else {
                            this.responseText = content || null;
                        }

                        this.readyState = 4;
                        this.status = !!content ? 200 : 404;
                        Ext.isFuntion(this.onreadystatechange) && this.onreadystatechange();
                        
                        // cleanup must be deferred on IE until after the
                        // callback completes
                        (function() {
                            this.el.onload = (this.el.onreadystatechange = e);
                            window[request.cbName] = undefined;
                            try {
                                delete window[request.cbName];
                            } catch (ex) {
                            }

                            if (!request.debug) {
                                var p = this.el.parentElement || this.el.parentNode;
                                p && p.removeChild(this.el);
                                p = null;
                            }

                            this.el = null;
                        }).defer(100, this);

                    }.createDelegate(o.conn, [o], true);

                    o.conn.open = function() {

                        if (o.cbParam) {
                            o.params[o.cbParam] = o.cbName;
                        }

                        var params = Ext.urlEncode(o.params) || null;

                        this.el = domNode(f.tag || 'script', {
                                    type : "text/javascript",
                                    src : params ? uri
                                            + (uri.indexOf("?") != -1
                                                    ? "&"
                                                    : "?") + params : uri,
                                    charset : f.charset || options.charset
                                            || null
                                }, null, f.target, true);

                    };

                    o.conn.readyState = 1; // show CallInProgress
                    Ext.isFunction(o.conn.onreadystatechange) && o.conn.onreadystatechange();
                    options.async = true; // force timeout support

                } else {
                    o = this.createXhrObject(tId);
                }
                if (o) {
                    this.transactionId++;
                }
            } catch (ex3) {
            } finally {
                return o;
            }
        },
        /** private */

        makeRequest : function(method, uri, callback, postData, options) {

            var o = this.getConnectionObject(uri, options);

            if (!o || o.status.isError) {
                return Ext.apply(o, this.handleTransactionResponse(o, callback));
            } else {

                o.options = options;
                A.activeRequests++;
                try {
                    o.conn.open(method.toUpperCase(), uri, options.async,
                            options.userId, options.password);
                    o.conn.onreadystatechange = this.onReadyState
                            ? this.onReadyState.createDelegate(this, [o], 0)
                            : Ext.emptyFn;
                } catch (ex) {
                    o.status.isError = true;
                    o.status.error = ex;
                    return Ext.apply(o, this.handleTransactionResponse(o,
                                    callback));
                }

                if (this.useDefaultXhrHeader) {
                    if (!this.defaultHeaders['X-Requested-With']) {
                        this.initHeader('X-Requested-With',
                                this.defaultXhrHeader, true);
                    }
                }
               
                this.setHeaders(o);
                
                if (o.options.async) { // Timers for syncro calls won't work
                                        // here, as it's a blocking call
                    this.handleReadyState(o, callback);
                }

                try {
                    if (!this.events
                            || this.fireEvent('beforesend', o, method, uri,
                                    callback, postData, options) !== false) {
                        o.conn.send(postData || null);
                    }
                } catch (exr) {
                    o.status.isError = true;
                    o.status.error = exr;
                    return Ext.apply(o, this.handleTransactionResponse(o, callback));
                }

                return options.async ? o : Ext.apply(o, this.handleTransactionResponse(o, callback));
            }
        },


        abort : function(o, callback, isTimeout) {

            if (o && o.queued && o.request) {
                o.request.active = o.queued = false;
                if (this.events) {
                    this.fireEvent('abort', o, callback);
                }
            } else if (o && this.isCallInProgress(o)) {
                o.conn.abort();
                window.clearInterval(this.poll[o.tId]);
                delete this.poll[o.tId];
                if (isTimeout) {
                    delete this.timeout[o.tId];
                }

                o.status.isAbort = !(o.status.isTimeout = isTimeout || false);
                if (this.events) {
                    this.fireEvent(isTimeout ? 'timeout' : 'abort', o, callback);
                }

                this.handleTransactionResponse(o, callback, true, isTimeout);

                return true;
            } else {
                return false;
            }
        },


        clearAuthenticationCache : function(url) {

            try {

                if (Ext.isIE) {
                    // IE clear HTTP Authentication, (but ALL realms though)
                    document.execCommand("ClearAuthenticationCache");
                } else {
                    // create an xmlhttp object
                    var xmlhttp;
                    if (xmlhttp = new XMLHttpRequest()) {
                        // prepare invalid credentials
                        xmlhttp.open("GET", url || '/@@', true, "logout",
                                "logout");
                        // send the request to the server
                        xmlhttp.send("");
                        // abort the request
                        xmlhttp.abort.defer(100, xmlhttp);
                    }
                }
            } catch (e) { // There was an error

            }
        },
        
        // private 
        initHeader : function(label, value) {         
            (this.headers = this.headers || {})[label] = value;                       
        },
        
        handleReadyState:function(o, callback){
            var oConn = this;

            if (callback && callback.timeout) {
                this.timeout[o.tId] = window.setTimeout(function() {
                    oConn.abort(o, callback, true);
                }, callback.timeout);
            }

            this.poll[o.tId] = window.setInterval(
                    function() {
                        if (o.conn && o.conn.readyState == 4) {
                            window.clearInterval(oConn.poll[o.tId]);
                            delete oConn.poll[o.tId];

                            if (callback && callback.timeout) {
                                window.clearTimeout(oConn.timeout[o.tId]);
                                delete oConn.timeout[o.tId];
                            }

                            oConn.handleTransactionResponse(o, callback);
                        }
                    }
               , this.pollInterval);
        },
        
        setHeaders:function(o){
            
            this.defaultHeaders && 
            forEach(this.defaultHeaders, function(value, key){
                o.conn.setRequestHeader(key, value);
            });

            this.headers && 
            forEach(this.headers, function(value, key){
                o.conn.setRequestHeader(key, value);
            });
                      
            this.headers = {};
            this.hasHeaders = false;
           
        },

        resetDefaultHeaders:function() {
            delete this.defaultHeaders;
            this.defaultHeaders = {};
            this.hasDefaultHeaders = false;
        },

        releaseObject:function(o){
            o && (o.conn = null);
            o = null;
        },
        activeX:[
        'MSXML2.XMLHTTP.3.0',
        'MSXML2.XMLHTTP',
        'Microsoft.XMLHTTP'
        ]

    });
    /**
     * private -- <script and link> tag support
     */
    var domNode = function(tag, attributes, callback, context, deferred) {
        attributes = Ext.apply({}, attributes || {});
        context || (context = window);

        var node = null, doc = context.document, 
            head = doc.getElementsByTagName("head")[0];

        if (doc && head && (node = doc.createElement(tag))) {
            forEach(attributes, function(value, attrib) {
                value && (attrib in node) && node.setAttribute(attrib, value);
            });

            if (callback) {
                var cb = (callback.success || callback).createDelegate(callback.scope || null, [callback], 0);
                if (Ext.isIE) {
                    node.onreadystatechange = node.onload = function() {
                        (/loaded|complete|4/i.test(String(this.readyState))) && cb();
                    }.createDelegate(node);
                } else if (Ext.isSafari3 && tag == 'script') {
                    // has DOM2 support
                    node.addEventListener("load", cb);
                } else if (Ext.isSafari) {
                    cb.defer(50);
                } else {
                    /*
                     * Gecko/Safari has no event support for link tag so just
                     * defer the callback 50ms (optimistic)
                     */
                    tag !== 'link' || Ext.isOpera ? Ext.get(node).on('load', cb) : cb.defer(50);
                }

            }
            !deferred && head.appendChild(node);
        }
        return node;

    };
    var StopIter = "StopIteration";
    if (Ext.util.Observable) {

        Ext.apply(A, {

            events : {
                request : true,
                beforesend : true,
                response : true,
                exception : true,
                abort : true,
                timeout : true,
                readystatechange : true,
                beforequeue : true,
                queue : true,
                queueempty : true
            },

            /*
             * onStatus define eventListeners for a single (or array) of
             * HTTP status codes.
             */

            onStatus : function(status, fn, scope, options) {
                var args = Array.slice(arguments, 1);
                status = new Array().concat(status || new Array());
                Ext.each(status, function(statusCode) {
                            statusCode = parseInt(statusCode, 10);
                            if (!isNaN(statusCode)) {
                                var ev = 'status:' + statusCode;
                                this.events[ev] || (this.events[ev] = true);
                                this.on.apply(this, [ev].concat(args));
                            }
                        }, this);
            },
            /*
             * unStatus unSet eventListeners for a single (or array) of
             * HTTP status codes.
             */

            unStatus : function(status, fn, scope, options) {
                var args = Array.slice(arguments, 1);
                status = new Array().concat(status || new Array());
                Ext.each(status, function(statusCode) {
                            statusCode = parseInt(statusCode, 10);
                            if (!isNaN(statusCode)) {
                                var ev = 'status:' + statusCode;
                                this.un.apply(this, [ev].concat(args));
                            }
                        }, this);
            },
            onReadyState : function() {
                this.fireEvent.apply(this, ['readystatechange'].concat(Array.slice(arguments, 0)));
            }

        }, new Ext.util.Observable());

        Ext.hasBasex = true;

        /*
         *
         * Version: 1.1
         * ***********************************************************************************
         * Author: Doug Hendricks. doug[always-At]theactivegroup.com Copyright
         * 2007-2008, Active Group, Inc. All rights reserved.
         * ***********************************************************************************
         *
         * License: Ext.ux.ModuleManager is licensed under the terms of : GNU
         * Open Source GPL 3.0 license:
         *
         * Commercial Use is prohibited without contacting
         * licensing[at]theactivegroup.com.
         *
         * This program is free software: you can redistribute it and/or modify
         * it under the terms of the GNU General Public License as published by
         * the Free Software Foundation, either version 3 of the License, or any
         * later version.
         *
         * This program is distributed in the hope that it will be useful, but
         * WITHOUT ANY WARRANTY; without even the implied warranty of
         * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
         * General Public License for more details.
         *
         * You should have received a copy of the GNU General Public License
         * along with this program. If not, see <
         * http://www.gnu.org/licenses/gpl.html>.
         *
         * Donations are welcomed: http://donate.theactivegroup.com
         *
         *
         * Sample Usage:
         *
         * YourApp.CodeLoader = new
         * Ext.ux.ModuleManager({modulePath:yourBasePath });
         * YourApp.CodeLoader.on({ 'beforeload':function(manager, module,
         * response){
         *
         * //return false to prevent the script from being executed. return
         * module.extension == 'js';
         *  } ,scope:YourApp.CodeLoader });
         *
         * //Create a useful 'syntax' for your App.
         *
         * YourApp.needs =
         * YourApp.CodeLoader.load.createDelegate(YourApp.CodeLoader);
         * YourApp.provide =
         * YourApp.CodeLoader.provides.createDelegate(YourApp.CodeLoader);
         *
         * YourApp.needs('ext/layouts','js/dragdrop','js/customgrid','style/custom.css');
         *
         * @class Ext.ux.ModuleManager
         *
         * Constructor - creates a new instance of ux.ModuleManager @name
         * ModuleManager @methodOf Ext.ux.ModuleManager @param {Object} config
         * Configuration options
         */

        Ext.ux.ModuleManager = function(config) {

            Ext.apply(this, config || {}, {
                        modulePath : function() { // based on current page
                            var d = location.href.indexOf('\/') != -1
                                    ? '\/'
                                    : '\\';
                            var u = location.href.split(d);
                            u.pop(); // this page
                            return u.join(d) + d;
                        }()
                    });

            this.addEvents({
                /**
                 * @event loadexception Fires when any exception is
                 *        raised returning false prevents any subsequent
                 *        pending module load requests
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 * @param {String}
                 *            module -- the module object
                 * @param {Object}
                 *            error -- An error object containing:
                 *            httpStatus, httpStatusText, error object
                 */
                "loadexception" : true,

                /**
                 * @event alreadyloaded Fires when the ModuleManager
                 *        determines that the requested module has
                 *        already been loaded
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 * @param {String}
                 *            module -- the module object
                 */
                "alreadyloaded" : true,

                /**
                 * @event load Fires when the retrieved content has been
                 *        successfully loaded
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 * @param {String}
                 *            module -- the module name
                 * @param {Object}
                 *            response -- the Ajax response object
                 * @param {String}
                 *            contents -- the raw text content retrieved
                 * @param {Boolean}
                 *            executed -- true if the resource was
                 *            executed into the target context.
                 */
                "load" : true,

                /**
                 * @event beforeload Fires when the request has
                 *        successfully completed and just prior to eval
                 *        returning false prevents the content (of this
                 *        module) from being loaded (eval'ed)
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 * @param {String}
                 *            module -- the module name
                 * @param {Object}
                 *            response - the Ajax response object
                 * @param {String}
                 *            contents -- the raw text content retrieved
                 */
                "beforeload" : true,

                /**
                 * @event complete Fires when all module load request
                 *        have completed (successfully or not)
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 * @param {Boolen}
                 *            success
                 * @param {Array}
                 *            loaded -- the modules now available as a
                 *            result of (or previously -- already
                 *            loaded) the last load operation.
                 * @param {Array}
                 *            executed -- modules that were executed
                 *            (evaled) as a result of (or previously
                 *            executed) the last load operation.
                 */
                "complete" : true,

                /**
                 * @event timeout Fires when module {@link #load} or
                 *        {@link #onAvailable} requests have timed out.
                 * @param {Ext.ux.ModuleManager}
                 *            this
                 */
                "timeout" : true
            });
            Ext.ux.ModuleManager.superclass.constructor.call(this);

        };

        /** @private */
        var gather = function(method, url, callbacks, data, options) {

            if (method == 'SCRIPT') {
                return Ext.apply(Ext.get(domNode('script', {
                                    type : "text/javascript",
                                    src : url
                                }, callbacks, options.target || window)), {
                            options : options
                        });
            } else if (method == 'LINK') {
                return Ext.apply(Ext.get(domNode('link', {
                                    rel : "stylesheet",
                                    type : "text/css",
                                    href : url
                                }, callbacks, options.target || window)), {
                            options : options
                        });
            } else {
                return A.request(method, url, callbacks, data, options);
            }

        };
        // normalize a resource to name-component hash
        /** @private */
        var modulate = function(moduleName, options) {
            if (!moduleName)
                return null;
            options || (options = {});
            var mname = String(moduleName.name || moduleName), name = mname
                    .trim().split('\/').last(), fname = options ? (name
                    .indexOf('.') !== -1 ? mname : mname + '.js') : '', path = options
                    && options.path ? String(options.path) : '';

            var mod = Ext.apply({
                        name : name,
                        fullName : moduleName.name ? moduleName.name : fname,
                        extension : !moduleName.name ? fname.split('.').last()
                                .trim().toLowerCase() : '',
                        path : path
                    }, options);

            mod.url = options.url || path + fname;
            return mod;
        };

        Ext.extend(Ext.ux.ModuleManager, Ext.util.Observable, {
            /**
             * @cfg {Boolean} disableCaching True to ensure the the browser's
             *      cache is bypassed when retrieving resources.
             */
            disableCaching : false,

            /** @private */

            modules : {},

            /**
             * @cfg {String} method The default request method used to retrieve
             *      resources. This method may also changed in-line during a
             *      {@link #load) operation. Supported methods:
             *      <ul>
             *      <li>DOM - Retrieve the resource by <SCRIPT/LINK> tag
             *      insertion</li>
             *      <li>GET Retrieve the resource by Ajax Request</li>
             *      <li>POST</li>
             *      <li>PUT</li>
             *      </ul>
             */

            method : 'GET',

            /**
             * @cfg {Boolean} noExecute Permits retrieval of a resource without
             *      script execution of the results. This option may also be
             *      changed in-line during a {@link #load) operation.
             */

            noExecute : false,
            /**
             * @cfg {Boolean} asynchronous Sets the default behaviour for AJAX
             *      requests onlu This option may also be changed in-line
             *      (async: true) during a {@link #load) operation.
             */

            asynchronous : true,

            /**
             * @cfg {Boolean} cacheResponses True, saves any content received in
             *      a content object with the following structure:
             *
             * This option may also be changed in-line during a
             * {@link #load) operation.
             */

            cacheResponses : false,

            /**
             * @cfg {Integer} onAvailable/load method timeout value in
             *      milliseconds
             */

            timeout : 30000,

            /**
             * @cfg {Boolean} True retains the resulting content within each
             *      module object for debugging.
             */

            debug : false,

            /** @private */
            loadStack : new Array(),

            loaded : function(name) {
                var module;
                return (module = this.getModule(name))? module.loaded === true : false;
            },


            getModule : function(name) {
                name && (name = name.name ? name.name : modulate(name, false).name);
                return name ? this.modules[name] : null;
            },
            /*
             * A mechanism for modules to identify their presence when loaded
             * via conventional <script> tags @param {String} module names(s)
             * Usage: <pre><code>Ext.Loader.provides('moduleA', 'moduleB');</code></pre>
             */

            createModule : function(name, extras) {
                var mod;
                mod = this.getModule(name);

                if (!mod) {
                    var m = modulate(name, extras);
                    mod = this.modules[m.name] = Ext.apply({
                                executed : false,
                                contentType : '',
                                content : null,
                                loaded : false,
                                pending : false
                            }, m);
                }

                return mod;
            },

            /**
             * Assert loaded status of module name arguments and invoke
             * callback(s) when all are available
             *
             * @param {Array/String}
             *            modules A list of module names to monitor
             * @param {Function}
             *            callback The callback function called when all named
             *            resources are available
             * @param (Object)
             *            scope The execution scope of the callback
             * @param {integer}
             *            timeout The timeout value in milliseconds.
             */

            onAvailable : function(modules, callback, scope, timeout, options) {

                if (arguments.length < 2) {
                    return false;
                }

                var MM = this;
                var block = {

                    modules : new Array().concat(modules),
                    poll : function() {
                        if (!this.polling)return;

                        var cb = callback, assert = false;

                        var res = Ext.each(this.modules, function(arg, index, args) {
                               return assert = (MM.loaded(arg) === true);
                        }, this);

                        if (!assert && this.polling && !this.aborted) {
                            this.poll.defer(50, this);
                            return;
                        }

                        this.stop();
                        Ext.isFunction(cb) && cb.call(scope, assert);
                        
                    },

                    polling : false,

                    abort : function() {
                        this.aborted = true;
                        this.stop();
                    },

                    stop : function() {
                        this.polling = false;
                        this.timer && clearTimeout(this.timer);
                        this.timer = null;
                    },

                    timer : null,

                    timeout : parseInt(timeout || MM.timeout, 10) || 10000,

                    onTimeout : function() {
                        this.abort();
                        MM.fireEvent('timeout', MM, this.modules);
                    },

                    retry : function(timeout) {

                        this.stop();
                        this.polling = true;
                        this.aborted = false;
                        this.timer = this.onTimeout.defer(this.timeout, this);
                        this.poll();
                        return this;
                    }
                };

                return block.retry();

            },

            /**
             * A mechanism for modules to identify their presence when loaded
             * via conventional <script> tags or nested on other scripts.
             *
             * @param {String}
             *            module names(s) Usage:
             *
             * <pre><code>
             * Ext.Loader.provides('moduleA', 'moduleB');
             * </code></pre>
             */

            provides : function() {
                Array.prototype.forEach.call(arguments, function(module) {

                            var moduleObj = this.createModule(module, false);
                            return Ext.apply(moduleObj, {
                                        executed : moduleObj.extension === 'js',
                                        contentType : '',
                                        content : null,
                                        loaded : true,
                                        pending : false
                                    });

                        }, this);

            },
            /**
             * load external resources in dependency order alternate load
             * syntax:
             *
             * <pre><code>
             *           load( 'moduleA', 'path/moduleB'  );
             *           load( {module:['modA','path/modB'], callback:cbFn, method:'DOM', queue:'fast', ... });
             *           load( {async:false, listeners: {complete: onCompleteFn, loadexception: loadExFn }}, 'moduleA', inlineFn, {async:true}, 'moduleB', inlineFn, .... );
             *
             * </code></pre>
             *
             * @name load
             * @methodOf Ext.ux.ModuleManager
             * @param {Mixed}
             *            args One or more module definitions, inline functions
             *            to be execute in sequential order
             */


            load : function(modList) {

                try {
                    var task = new Task(this, Ext.isArray(modList)
                                    ? modList : Array.slice(arguments, 0));
                    task.start();

                } catch (ex) {
                    if (ex != StopIter) {

                        if (task) {
                            task.lastError = ex;
                            task.active = false;
                        }
                        
                        this.fireEvent('loadexception', this, task
                                        ? task.currentModule
                                        : null, this.lastError = ex);
                    }
                }

                return task;
            },


            globalEval : function(data, scope, context) {
                scope || (scope = window);
                data = String(data || "").trim();
                if (data.length === 0) {return false;}
                try {
                    if (scope.execScript) {
                        // window.execScript in IE fails when scripts include
                        // HTML comment tag.
                        scope.execScript(data.replace(/^<!--/, "").replace(/-->$/, ""));

                    } else {
                        // context (target namespace) is only support on Gecko.
                        eval.call(scope, data, context || null);
                    }
                    return true;
                } catch (ex) {
                    return ex;
                }

            },
            styleAdjust : null,


            applyStyle : function(module, styleRules, target) {
                var rules;
                if (module = this.getModule(module)) {
                    // All css is injected into document's head section
                    var doc = (target || window).document;
                    var ct = (styleRules
                            || (module.content ? module.content.text : '') || '')
                            + '';
                    var head;
                    if (doc && !!ct.length
                            && (head = doc.getElementsByTagName("head")[0])) {

                        if (module.element) {
                            this.removeModuleElement(module);
                        }
                        if (this.styleAdjust && this.styleAdjust.pattern) {
                            // adjust CSS (eg. urls (images etc))
                            ct = ct.replace(this.styleAdjust.pattern,
                                    this.styleAdjust.replacement || '');
                        }

                        rules = module.element = doc.createElement("style");
                        rules.setAttribute("type", "text/css");
                        if (Ext.isIE) {
                            head.appendChild(rules);
                            rules.styleSheet.cssText = ct;
                        } else {
                            try {
                                rules.appendChild(doc.createTextNode(ct));
                            } catch (e) {
                                rules.cssText = ct;
                            }
                            head.appendChild(rules);
                        }
                    }
                }
                return rules; // the style element created
            },

            /**
             * Remove a style element
             *
             * @name removeStyle
             * @param {Mixed}
             *            module A Ext.ux.ModuleManager.module or dom Node
             * @return {Ext.Element} the element removed.
             */

            removeStyle : function(module) {
                return this.removeModuleElement(module);
            },

            /** @private */
            // Remove an associated module.element from the DOM

            removeModuleElement : function(module) {
                var el;
                if (module = this.getModule(module)) {
                    if (el = module.element) {
                        el.dom ? el.removeAllListeners().remove() : Ext.removeNode(el);
                        module.element = null;
                    }
                }

            }
        });

        var Task = Ext.ux.ModuleManager.Task = function(MM, modules) {

            Ext.apply(this, {
                        result : true,
                        active : false,
                        options : null,
                        executed : new Array(),
                        loaded : new Array(),
                        params : null,
                        data : null,
                        oav : null,
                        unlisteners : new Array(),
                        MM : MM,
                        id : Ext.id(null, 'mm-task-'),
                        defOptions : {
                            async : MM.asynchronous,
                            headers : MM.headers || false,
                            modulePath : MM.modulePath,
                            forced : false,
                            cacheResponses : MM.cacheResponses,
                            method : (MM.noExecute || MM.cacheResponses
                                    ? 'GET'
                                    : MM.method || 'GET').toUpperCase(),
                            noExecute : MM.noExecute || false,
                            disableCaching : MM.disableCaching,
                            timeout : MM.timeout,
                            callback : null,
                            scope : null,
                            params : null
                        }
                    });

            this.prepare(modules);

        };
        Ext.apply(Task.prototype, {
            /**
             *  @private
             *  
             */
            
            start : function() {
                this.active = true;
                this.nextModule();
                if (this.options.async) {
                    this.oav = this.MM.onAvailable.call(this.MM,
                            this.onAvailableList, this.onComplete, this,
                            this.options.timeout, this.options);
                } else {
                    this.onComplete(this.result);
                }

            },

            /**
             *  @private
             *  
             */
            doCallBacks : function(o, success, currModule, args) {
                var cb;
                if (currModule) {
                    var res = this.MM.fireEvent.apply(this.MM, [
                                    (success ? 'load' : 'loadexception'),
                                    this.MM, currModule].concat(args || new Array()));
                    !success && (this.active = res);

                    // Notify other pending async listeners
                    if (this.active && currModule.notify) {

                        forEach(currModule.notify, function(chain, index, chains) {
                                    if (chain) {
                                        chain.nextModule();
                                        chains[index] = null;
                                    }
                                });
                        currModule.notify = new Array();
                    }
                }
            },
            
            /**
             *  @private
             *  
             */
            success : function(response) {

                var module = response.argument.module.module, opt = response.argument.module, executable = (!opt.proxied
                        && module.extension == "js" && !opt.noExecute && opt.method !== 'DOM'), cbArgs = null;

                this.currentModule = module.name;

                if (!module.loaded) {
                    try {

                        if (this.MM.fireEvent('beforeload', this.MM, module,
                                response, response.responseText) !== false) {

                            Ext.apply(module, {
                                loaded : true,
                                pending : false,
                                contentType : response.getResponseHeader('Content-Type') || '',
                                content : opt.cacheResponses
                                        || module.extension == "css" ? {
                                    text : response.responseText || null,
                                    XML : response.responseXML || null,
                                    JSON : response.responseJSON || null
                                } : null
                            });

                            this.loaded.push(module);
                            var exception = executable
                                    && (!module.executed || opt.forced)
                                    ? this.MM.globalEval(response.responseText, opt.target)
                                    : true;
                            if (exception === true) {
                                if (executable) {
                                    module.executed = true;
                                    this.executed.push(module);
                                }
                                cbArgs = [response, response.responseText, module.executed];
                            } else {
                                // coerce to actual module URL
                                throw Ext.applyIf({
                                            fileName : module.url,
                                            lineNumber : exception.lineNumber || 0
                                        }, exception);
                            }
                        }

                    } catch (exl) {
                        cbArgs = [{
                                    error : (this.lastError = exl),
                                    httpStatus : response.status,
                                    httpStatusText : response.statusText
                                }];

                        this.result = false;
                    }

                    this.doCallBacks(opt, this.result, module, cbArgs);
                } else {

                    if (opt.async) {
                        this.nextModule();
                    }
                }

            },

            /**
             *  @private
             *  
             */
            
            failure : function(response) {
                var module = response.argument.module.module, opt = response.argument.module;

                module.contentType = response.getResponseHeader
                        ? response.getResponseHeader('Content-Type') || ''
                        : '';
                this.currentModule = module.name;
                this.result = module.pending = false;

                this.doCallBacks(opt, this.result, module, [{
                            error : (this.lastError = response.fullStatus.error),
                            httpStatus : response.status,
                            httpStatusText : response.statusText
                        }]);
            },

            /**
             *  @private
             *  
             */
            
            nextModule : function() {
                var module, transport, executable, options, url;

                while (this.active && (module = this.workList.shift())) {

                    // inline callbacks
                    if (typeof module == 'function') {
                        module.apply(this, [this.result, null, this.loaded]);
                        continue;
                    }

                    // setup possible single-use listeners for the current
                    // request chain
                    if (module.listeners) {
                        this.unlisteners.push(module.listeners);
                        this.MM.on(module.listeners);
                        delete module.listeners;

                    }

                    var params = null, data = null, moduleObj;
                    if (params = module.params) {
                        if (typeof params == "function") {
                            params = params.call(options.scope || window,
                                    options);
                        }
                        if (typeof params == "object") {
                            params = Ext.urlEncode(params);
                        }
                        module.params = data = params; // setup for possible
                                                        // post
                    }

                    options = module;

                    if (moduleObj = this.MM.createModule(module.module, {
                                path : options.modulePath
                            })) {
                        url = moduleObj.url;

                        executable = (!options.proxied
                                && moduleObj.extension == "js" && !options.noExecute);

                        if ((!moduleObj.loaded) || options.forced) {

                            if (!moduleObj.pending) {
                                moduleObj.pending = true;
                                if (/get|script|dom|link/i.test(options.method)) {
                                    url += (params ? '?' + params : '');
                                    if (options.disableCaching === true) {
                                        url += (params ? '&' : '?') + '_dc='
                                                + (new Date().getTime());
                                    }
                                    data = null;
                                }

                                options.async = options.method === 'DOM'
                                        ? true
                                        : options.async;

                                transport = gather(options.method == 'DOM'
                                                ? (moduleObj.extension == 'css'
                                                        ? 'LINK'
                                                        : 'SCRIPT')
                                                : options.method, url, {
                                            success : this.success,
                                            failure : this.failure,
                                            scope : this,
                                            argument : {
                                                module : module
                                            }
                                        }, data, options);

                                moduleObj.transport = options.debug
                                        ? transport
                                        : null;
                                options.method == 'DOM' && (moduleObj.element = transport);
                                
                            }

                            if (options.async) { break; }

                        } else {
                            this.active = this.MM.fireEvent('alreadyloaded', this.MM, moduleObj) !== false;
                            executable && this.executed.push(moduleObj);
                            this.loaded.push(moduleObj);
                        }

                    } // if moduleObj
                } // oe while(module)

                if (this.active && module && module.async && moduleObj) {
                    moduleObj.notify || (moduleObj.notify = new Array());
                    moduleObj.notify.push(this);
                }

            },
            
            /**
             *  @private
             * Normalize requested modules and options into a sequential series
             * of load requests and inline callbacks
             */

            prepare : function(modules) {

                var onAvailableList = new Array(), 
                    workList = new Array(), 
                    options = this.defOptions, 
                    mtype, 
                    MM = this.MM;
                    
                var adds = new Array();

                var expand = function(mods) {

                    mods = new Array().concat(mods);
                    var adds = new Array();
                    forEach(mods, function(module) {

                        if (!module)return;
                        var m;

                        mtype = typeof(module);
                        switch (mtype) {
                            case 'string' : // a named resource

                                m = MM.createModule(module, {
                                            path : options.modulePath,
                                            url : module.url || null
                                        });
                                if (!m.loaded) {
                                    module = Ext.applyIf({
                                                name : m.name,
                                                module : m,
                                                callback : null
                                            }, options);
                                    delete options.listeners;
                                    workList.push(module);
                                    adds.push(module);
                                }

                                onAvailableList.push(m.name);
                                break;
                            case 'object' : // or array of modules
                                // coerce to array to support this notation:
                                // {module:'name' or
                                // {module:['name1','name2'],callback:cbFn,...
                                // so that callback is only called when the last
                                // in the implied list is loaded.

                                if (m = (module.modules || module.module)) {
                                    adds = expand(m);
                                    delete module.module;
                                    delete module.modules;
                                }

                                if (module.proxied) {
                                    module.method = 'GET';
                                    module.cacheResponses = module.async = true;
                                }

                                if (Ext.isArray(module)) {
                                    adds = expand(module);
                                } else {
                                    var mod = module;
                                    if (module.name) { // for notation
                                                        // {name:'something',
                                                        // url:'assets/something'}

                                        m = MM.createModule(module, {
                                                    path : options.modulePath,
                                                    url : mod.url || null
                                                });
                                        delete mod.url;
                                        Ext.apply(options, mod);
                                        if (!m.loaded) {
                                            mod = Ext.applyIf({
                                                        name : m.name,
                                                        module : m,
                                                        callback : null
                                                    }, options);
                                            delete options.listeners;
                                            workList.push(mod);
                                            adds.push(mod);
                                        }

                                        onAvailableList.push(m.name);

                                    } else {
                                        Ext.apply(options, mod);
                                    }

                                }
                                break;
                            case 'function' :
                                workList.push(module);
                            default :
                        }

                    });

                    return adds;
                };

                expand(modules);
                this.options = options;
                this.workList = workList.flatten().compact();
                this.onAvailableList = onAvailableList.flatten().unique();
            },
            
            /**
             * @private
             */
            onComplete : function(loaded) { // called with scope of last module
                                            // in chain
                var cb;

                if (loaded) {

                    if (cb = this.options.callback) {
                        cb.apply(this.options.scope || this, [this.result,
                                        this.loaded, this.executed]);
                    }
                    this.MM.fireEvent('complete', this.MM, this.result,
                            this.loaded, this.executed);
                }

                // cleanup single-use listeners from the previous request chain
                if (this.unlisteners) {
                    forEach(this.unlisteners, function(block) {
                        forEach(block, function(listener, name,
                                        listeners) {
                                    var fn = listener.fn || listener;
                                    var scope = listener.scope
                                            || listeners.scope
                                            || this.MM;
                                    var ev = listener.name || name;
                                    this.MM.removeListener(ev, fn,
                                            scope);
                                }, this);
                    }, this);
                }
                this.active = false;
            }
        });
    }

})();

// Array, object iteration and clone support
(function() {
    Ext.stopIteration = { stopIter : true };

    Ext.applyIf(Array.prototype, {

        /*
         * Fix for Opera, which does not seem to include the map
         * function on Array's
         */
        map : function(fun, scope) {
            var len = this.length;
            if (typeof fun != "function") {
                throw new TypeError();
            }
            var res = new Array(len);

            for (var i = 0; i < len; i++) {
                if (i in this) {
                    res[i] = fun.call(scope || this, this[i], i, this);
                }
            }
            return res;
        },

        include : function(value, deep) { // Boolean: is value present
                                            // in Array
            // use native indexOf if available
            if (!deep && typeof this.indexOf == 'function') {
                return this.indexOf(value) != -1;
            }
            var found = false;
            try {
                this.forEach(function(item, index) {
                    if (found = (deep
                            ? (item.include
                                    ? item.include(value, deep)
                                    : (item === value))
                            : item === value)) {
                        throw Ext.stopIteration;
                    }
                });
            } catch (exc) {
                if (exc != Ext.stopIteration) {
                    throw exc;
                }
            }
            return found;
        },
        // Using iterFn, traverse the array, push the current element
        // value onto the
        // result if the iterFn returns true
        filter : function(iterFn, scope) {
            var a = new Array();
            iterFn || (iterFn = function(value) {
                return value;
            });
            this.forEach(function(value, index) {
                iterFn.call(scope, value, index) && a.push(value);
            });
            return a;
        },

        compact : function(deep) { // Remove null, undefined array
                                    // elements
            var a = new Array();
            this.forEach(function(v) {
                (v === null || v === undefined) || a.push(deep && Ext.isArray(v) ? v.compact() : v);
            }, this);
            return a;
        },

        flatten : function() { // flatten: [1,2,3,[4,5,6]] ->
                                // [1,2,3,4,5,6]
            var a = new Array();
            this.forEach(function(v) {
                Ext.isArray(v) ? (a = a.concat(v)) : a.push(v);
            }, this);
            return a;
        },

        unique : function(sorted /* sort optimization */, exact) { // unique:
                                                                    // [1,3,3,4,4,5]
                                                                    // ->
                                                                    // [1,3,4,5]
            var a = new Array();
            this.forEach(function(value, index) {
                if (0 == index
                        || (sorted ? a.last() != value : !a.include(value, exact))) {
                    a.push(value);
                }
            }, this);
            return a;
        },
        // search array values based on regExpression pattern returning
        // test (and optionally execute function(value,index) on test
        // before returned)
        grep : function(pattern, iterFn, scope) {
            var a = new Array();
            iterFn || (iterFn = function(value) {
                return value;
            });
            var fn = scope ? iterFn.createDelegate(scope) : iterFn;

            if (typeof pattern == 'string') {
                pattern = new RegExp(pattern);
            }
            this.forEach(function(value, index) {
                pattern.test(value) && a.push(fn(value, index));
            });
            return a;
        },
        first : function() {
            return this[0];
        },

        last : function() {
            return this[this.length - 1];
        },

        clear : function() {
            this.length = 0;
        },

        // return an array element selected at random
        atRandom : function(defValue) {
            var r = Math.floor(Math.random() * this.length);
            return this[r] || defValue;
        },

        clone : function(deep) {
            if (!deep) {
                return this.concat();
            }

            var length = this.length || 0, t = new Array(length);
            while (length--) {
                t[length] = clone(this[length], true);
            }
            return t;

        },
         /*
         * Array forEach Iteration based on previous work by: Dean Edwards
         * (http://dean.edwards.name/weblog/2006/07/enum/) Gecko already
         * supports forEach for Arrays : see
         * http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Objects:Array:forEach
         */
        forEach : function( block, scope) {

            if (typeof block != "function") {
                throw new TypeError();
            }
            var i = 0, length = this.length;
            while (i < length) {
                block.call(scope, this[i], i++, this);
            }
          }

    });


    // globally resolve forEach enumeration
    window.forEach = function(object, block, context) {
        context = context || object;
        if (object) {
            if (typeof block != "function") {
                throw new TypeError();
            }
            var resolve = Object; // default
            if (object instanceof Function) {
                // functions have a "length" property
                resolve = Function;
            } else if (object.forEach instanceof Function) {
                // the object implements a custom forEach method so use that
                object.forEach(block, context);
                return;

            } else if (typeof object == "string") {
                // the object is a string
                resolve = String;
            } else if (typeof object.length == "number") {
                // the object is array-like
                return Array.prototype.forEach.call(object, block, context);
            }

            return resolve.forEach(object, block, context);
        }
    };

    /**
     * @private
     * Primary clone Function
     */
    var clone = function(obj, deep) {

        if (Ext.isFunction(obj.clone)) {
            return obj.clone(deep);
        }

        if (!obj) {return obj;}

        var o = {};
        forEach(obj, function(val, name, objAll) {
            o[name] = (val === objAll ? // reference to itself?
                    o : deep ? clone(val, true) : val);
         });
        return o;
    };

    // Permits: Array.slice(arguments, 1);
    if (!Array.slice) { // mozilla already supports this
        var slice = Array.prototype.slice;
        Array.slice = function(object) {
            return slice.apply(object, slice.call(arguments, 1));
        };
    }
    //Add clone function to prototypes
    forEach([Number, RegExp, Boolean], function(t) {
                t.prototype.clone = function(deep) {
                    return deep ? new t(this) : this;
                }
            });

    Ext.applyIf(Date.prototype, {
        clone  : function(deep){
            return deep? new Date(this.getTime()) : this ;
        }
    });

    // enumerate custom class properties (not prototypes)
    // usually only called by the global forEach function
    Ext.applyIf(Function.prototype, {
        forEach : function(object, block, context) {
            if (typeof block != "function") {
                throw new TypeError();
            }
            for (var key in object) {
                // target defined properties/methods only
                if (typeof this.prototype[key] == "undefined") { 
                    try {
                        block.call(context, object[key], key, object);
                    } catch (e) {
                    }
                }
            }
        },
        clone : function(deep) {
            return this;
        }
    });

    // character enumeration
    Ext.applyIf(String.prototype, {
                forEach : function(block, context) {
                    if (typeof block != "function") {
                        throw new TypeError();
                    }

                    Array.forEach(this.split(""), function(chr, index) {
                                block.call(context || this, chr, index, this);
                            }, this);
                },

                trim : function() {
                    var re = /^\s+|\s+$/g;
                    return function() {
                        return this.replace(re, "");
                    };
                }(),

                clone : function(deep) {
                    return deep ? String(this) : this;
                }

            });

    Ext.clone = clone;
    var overload = function(pfn, fn ){

           var f = typeof pfn =='function' ? pfn : function(){};

           var ov = f._ovl; //call signature hash
           if(!ov){
               ov = { base: f};
               ov[f.length|| 0] = f;

               f= function(){  //the proxy stub
                  var o = arguments.callee._ovl;
                  var fn = o[arguments.length] || o.base;
                  //recursion safety
                  return fn && fn != arguments.callee ? fn.apply(this,arguments): undefined;
               };
           }
           var fnA = [].concat(fn);
           for(var i=0,l=fnA.length; i<l; i++){
             //ensures no duplicate call signatures, but last in rules!
             ov[fnA[i].length] = fnA[i];
           }
           f._ovl= ov;
           return f;

       };

       
    Ext.applyIf(Ext,{
        overload : overload( overload,
           [
             function(fn){ return overload(null, fn);},
             function(obj, mname, fn){
                 return obj[mname] = overload(obj[mname],fn);}
          ]),
          
        isArray : function(v){
           return Object.prototype.toString.apply(v) === '[object Array]';
        },
        
        isObject:function(obj){
            return (obj !== null) && typeof obj === 'object';
        },
        
        isDocument : function(obj){
            return Object.prototype.toString.apply(obj) === '[object HTMLDocument]' || (obj && obj.nodeType === 9);
        },
        
        isElement : function(obj){
            return obj && Ext.type(obj)=== 'element';
        },
        
        isEvent : function(obj){
            return Object.prototype.toString.apply(obj) === '[object Event]' || (Ext.isObject(obj) && !Ext.type(o.constructor) && (window.event && o.clientX && o.clientX === window.event.clientX));
        },

        isFunction: function(obj){
            return typeof obj === 'function';
        },
        
        isString : function(obj){
            return Ext.type(obj)==='string';    
        },
        
        isEventSupported : (function(){
	        var TAGNAMES = {
	          'select':'input','change':'input',
	          'submit':'form','reset':'form',
	          'error':'img','load':'img','abort':'img'
	        };
	        //Cached results
	        var cache = {};
	        //Get a tokenized string unique to the node and event type
	        var getKey = function(type, el){
	            return (el ? 
                           (Ext.isElement(el) || Ext.isDocument(el) ? 
                                el.nodeName.toLowerCase() : 
                                    el.id || Ext.type(el)) 
                       : 'div') + ':' + type;
	        };
	
	        return function (evName, testEl) {
               
	          var key = getKey(evName, testEl);
              if(key in cache){
                //Use a previously cached result if available
                return cache[key];
              }
	          var el, isSupported = window.Event ? String(evName).toUpperCase() in window.Event: false;
	         
	          if(!isSupported){
	            var eventName = 'on' + evName;
	            el = testEl || document.createElement(TAGNAMES[eventName] || 'div');
	            isSupported = (eventName in el);
	          }
	          if (!isSupported && el) {
	            el.setAttribute && el.setAttribute(eventName, 'return;');
	            isSupported = Ext.isFunction(el[eventName]);
	          }
	          //save the cached result for future tests
	          cache[getKey(evName, el)] = isSupported;
	          el = null;
	          return isSupported;
	        };
	        
	    })(),
        
        capabilities : {
            hasActiveX : !!window.ActiveXObject,
            hasFlash : (function(){
                //Check for ActiveX first because some versions of IE support navigator.plugins, just not the same as other browsers
		        if(window.ActiveXObject){
		            try{
		                //try to create a flash instance
		                new ActiveXObject("ShockwaveFlash.ShockwaveFlash");
		                return true;
		            }catch(e){};
		            //If the try-catch fails, return false
		            return false;
		        }else if(navigator.plugins){
		            //Loop through all the plugins
		            for(var i=0, length = navigator.plugins.length; i < length; i++){
		                //test to see if any plugin names contain the word flash, if so it must support it - return true
		                if((/flash/gi).test(navigator.plugins[i].name)){
		                    return true;
		                }
		            }
		            //return false if no plugins match
		            return false;
		        }
		        //Return false if ActiveX and nagivator.plugins are not supported
		        return false;
                })(),
            hasCookies : !!navigator.cookieEnabled && navigator.cookieEnabled,
            hasCanvas  : !!document.createElement("canvas").getContext,
            hasSVG     : !!(document.createElementNS && document.createElementNS('http://www.w3.org/2000/svg', 'svg').width),
            hasXpath   : !!document.evaluate,
            hasBasex   : true
        }
        
        
    });

})();
