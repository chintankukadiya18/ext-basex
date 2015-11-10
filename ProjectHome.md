ext-basex 4.0 adds several Ajax enhancements to the existing ext-base adapter available in the venerable [Extjs](http://www.extjs.com) (v 2.1 or higher) framework.

These include:

  * Synchonous XHR Request support
  * Integral Request Queuing (with named-queues and priorities)
  * Multipart Response Handling
  * Pluggable Form encoding support
  * Proxied (JSONP) cross-domain Requests [Flickr Sample](http://demos.theactivegroup.com?demo=basex&script=flickr)
  * Global event handlers:
    * request
    * beforesend
    * response
    * exception
    * abort
    * timeout
    * readystatechange
    * beforequeue
    * queue
    * queueempty
  * Ajax request can be made to local filesystems (CD/DVD, etc)
  * Adds Basic HTTP Auth support to requests
  * forEach -- object/array/string iteration
  * additional popular Array.prototype methods (compact,flatten,include,unique,clear,clone,filter,grep,first,last,atRandom)
  * Ext.clone method clones all complex JS types.

  * HTML5 Capabilities detection:
> > Ext.capabilities object (singleton) reports detected browser capabilities:
      * hasActiveX
      * hasXDR
      * hasChromeFrame (Google IE Plugin for Webkit rendering engine)
      * hasFlash
      * hasCookies
      * hasCanvas
      * hasCanvasText
      * hasSVG
      * hasInputAutoFocus
      * hasInputPlaceHolder
      * hasXpath
      * hasWorkers
      * hasOffline
      * hasLocalStorage
      * hasGeoLocation
      * hasAudio
      * hasAudio.testMime (test for specific mime-type Support)
      * hasVideo
      * hasVideo.testCodec (test for specific Codec Support)
      * isEventSupported('load','img')

[FAQ](FAQ.md)