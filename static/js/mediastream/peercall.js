/*
 * Spreed WebRTC.
 * Copyright (C) 2013-2014 struktur AG
 *
 * This file is part of Spreed WebRTC.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
define(['jquery', 'underscore', 'mediastream/utils', 'mediastream/peerconnection'], function($, _, utils, PeerConnection) {

	var PeerCall = function(webrtc, id, from, to) {

		this.webrtc = webrtc;
		this.id = id;
		this.from = from;
		this.to = to;

		this.e = $({}) // events

		this.mediaConstraints = $.extend(true, {}, this.webrtc.settings.mediaConstraints);
		this.pcConfig = $.extend(true, {}, this.webrtc.settings.pcConfig);
		this.pcConstraints = $.extend(true, {}, this.webrtc.settings.pcConstraints);
		this.sdpConstraints = $.extend(true, {}, this.webrtc.settings.sdpConstraints);
		this.offerConstraints = $.extend(true, {}, this.webrtc.settings.offerConstraints);

		this.peerconnection = null;
		this.datachannels = {};
		this.streams = {};

		this.initiate = false;
		this.closed = false;

	};

	PeerCall.prototype.setInitiate = function(initiate) {
		this.initiate = !! initiate;
		//console.log("Set initiate", this.initiate, this);
	};

	PeerCall.prototype.createPeerConnection = function(success_cb, error_cb) {

		var peerconnection = this.peerconnection = new PeerConnection(this.webrtc, this);
		if (success_cb && peerconnection.pc) {
			success_cb(peerconnection);
		}
		if (error_cb && !peerconnection.pc) {
			// TODO(longsleep): Check if this can happen?
			error_cb(peerconnection);
		}
		return peerconnection;

	};

	PeerCall.prototype.createOffer = function(cb) {

		var constraints = utils.mergeConstraints(this.offerConstraints, this.sdpConstraints);
		console.log('Creating offer with constraints: \n' +
			'  \'' + JSON.stringify(constraints, null, '\t') + '\'.')
		this.peerconnection.createOffer(_.bind(this.onCreateAnswerOffer, this, cb), _.bind(this.onErrorAnswerOffer, this), constraints);

	};

	PeerCall.prototype.createAnswer = function(cb) {

		console.log("Creating answer.");
		this.peerconnection.createAnswer(_.bind(this.onCreateAnswerOffer, this, cb), _.bind(this.onErrorAnswerOffer, this), this.peerconnection.sdpConstraints);

	};

	PeerCall.prototype.onCreateAnswerOffer = function(cb, sessionDescription) {

		// Prefer Opus.
		sessionDescription.sdp = utils.preferOpus(sessionDescription.sdp);

		// Convert to object to allow custom property injection.
		var sessionDescriptionObj = sessionDescription;
		if (sessionDescriptionObj.toJSON) {
			sessionDescriptionObj = JSON.parse(JSON.stringify(sessionDescriptionObj));
		}
		console.log("Created offer/answer", JSON.stringify(sessionDescriptionObj, null, "\t"));

		// Allow external session description modifications.
		this.e.triggerHandler("sessiondescription", [sessionDescriptionObj, this]);
		// Always set local description.
		this.peerconnection.setLocalDescription(sessionDescription, _.bind(function() {
			console.log("Set local session description.", sessionDescription, this);
			if (cb) {
				cb(sessionDescriptionObj, this);
			}
		}, this), _.bind(function(err) {
			console.error("Set local session description failed", err);
			this.close();
			this.e.triggerHandler("error", "failed_peerconnection_setup");
		}, this));

	};

	PeerCall.prototype.onErrorAnswerOffer = function(event) {

		console.error("Failed to create answer/offer", event);

	};

	PeerCall.prototype.setRemoteDescription = function(sessionDescription, cb) {

		var peerconnection = this.peerconnection;
		if (!peerconnection) {
			console.log("Got a remote description but not connected -> ignored.");
			return;
		}
		peerconnection.setRemoteDescription(sessionDescription, _.bind(function() {
			console.log("Set remote session description.", sessionDescription, this);
			if (cb) {
				cb(sessionDescription, this);
			}
			// NOTE(longsleep): There are several szenarios where onaddstream is never fired, when
			// the peer does not provide a certain stream type (eg. has no camera). See
			// for example https://bugzilla.mozilla.org/show_bug.cgi?id=998546. For this
			// reason we always trigger onRemoteStream added for all streams which are available
			// after the remote SDP was set successfully.
			_.defer(_.bind(function() {
				_.each(peerconnection.getRemoteStreams(), _.bind(function(stream) {
					if (!this.streams.hasOwnProperty(stream)) {
						console.log("Adding stream after remote SDP success.", stream);
						this.onRemoteStreamAdded(stream);
					}
				}, this));
			}, this));
		}, this), _.bind(function(err) {
			console.error("Set remote session description failed", err);
			this.close();
			this.e.triggerHandler("error", "failed_peerconnection_setup");
		}, this));

	};

	PeerCall.prototype.onIceCandidate = function(event) {
		if (event.candidate) {
			//console.log("ice candidate", event.candidate);
			var payload = {
				type: 'candidate',
				sdpMLineIndex: event.candidate.sdpMLineIndex,
				sdpMid: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			};
			// Allow external payload modifications.
			this.e.triggerHandler("icecandidate", [payload, this]);
			// Send it.
			// TODO(longsleep): This id needs to be different for PeerXfers.
			// XXX(longsleep): This seems to be breaking conferences when this.to and not this.id.
			this.webrtc.api.sendCandidate(this.to, payload);
			//console.log("Sent candidate", event.candidate.sdpMid, event.candidate.sdpMLineIndex, event.candidate.candidate);
		} else {
			console.log('End of candidates.');
		}
	};

	PeerCall.prototype.onIceConnectionStateChange = function(iceConnectionState) {

		this.e.triggerHandler("connectionStateChange", [iceConnectionState, this]);

	};

	PeerCall.prototype.onRemoteStreamAdded = function(stream) {

		this.streams[stream] = true;
		this.e.triggerHandler("remoteStreamAdded", [stream, this]);

	};

	PeerCall.prototype.onRemoteStreamRemoved = function(stream) {

		this.e.triggerHandler("remoteStreamRemoved", [stream, this]);
		if (stream) {
			delete this.streams[stream];
		}

	};

	PeerCall.prototype.onNegotiationNeeded = function(peerconnection) {

		var remoteDescription = peerconnection.pc.remoteDescription;
		console.log("Negotiation needed.", remoteDescription);
		if (remoteDescription && remoteDescription.type === "offer") {
			// Need to answer.
			// XXX(longsleep): In cases where we are in answer state but need to
			// negotiate again, createAnswer will do nothing. We might need to call
			// createOffer and send it out as answer? Is that valid / makes sense?
			this.createAnswer(_.bind(function(sessionDescription) {
				console.log("Sending new negotiation answer with sessionDescription", sessionDescription, this.id);
				this.webrtc.api.sendAnswer(this.to, sessionDescription);
			}, this));
		} else {
			// Send offer.
			this.createOffer(_.bind(function(sessionDescription) {
				console.log("Sending new negotiation offer with sessionDescription", sessionDescription, this.id);
				this.webrtc.api.sendOffer(this.to, sessionDescription);
			}, this));
		}

	};

	PeerCall.prototype.addIceCandidate = function(candidate) {

		if (this.closed) {
			// Avoid errors when still receiving candidates but closed.
			return;
		}
		this.peerconnection.addIceCandidate(candidate);

	};

	PeerCall.prototype.onDatachannel = function(datachannel) {

		//console.log("onDatachannel", datachannel);
		var label = datachannel.label;
		if (this.datachannels.hasOwnProperty(label)) {
			console.warn("Received duplicated datachannel label", label, datachannel, this.datachannels);
			return;
		}
		// Remember it for correct cleanups.
		this.datachannels[label] = datachannel;
		this.e.triggerHandler("datachannel", ["new", datachannel, this]);

	};

	PeerCall.prototype.onDatachannelDefault = function(state, datachannel) {

		if (state === "open") {
			//console.log("Data ready", this);
			_.defer(_.bind(function() {
				this.e.triggerHandler("dataReady", [this]);
			}, this));
		}
		this.e.triggerHandler("datachannel.default", [state, datachannel, this]);

	};

	PeerCall.prototype.onMessage = function(event) {

		//console.log("Peer to peer channel message", event);
		var data = event.data;

		if (data instanceof Blob) {
			console.warn("Blob data received - not implemented.", data);
		} else if (data instanceof ArrayBuffer) {
			console.warn("ArrayBuffer data received - not implemented.", data);
		} else if (typeof data === "string") {
			if (data.charCodeAt(0) === 2) {
				// Ignore whatever shit is this (sent by Chrome 34 and FireFox). Feel free to
				// change the comment it you know what this is.
				return;
			}
			//console.log("Datachannel message", [event.data, event.data.length, event.data.charCodeAt(0)]);
			var msg = JSON.parse(event.data);
			this.webrtc.api.received({
				Type: msg.Type,
				Data: msg,
				To: this.webrtc.api.id,
				From: this.id,
				p2p: true
			}); //XXX(longsleep): use event for this?
		} else {
			console.warn("Unknow data type received -> igored", typeof data, [data]);
		}

	};

	PeerCall.prototype.getDatachannel = function(label, init, create_cb) {

		//console.log("getDatachannel", label);
		var datachannel = this.datachannels[label];
		if (!datachannel) {
			console.log("Creating new datachannel", label, init);
			datachannel = this.peerconnection.createDatachannel(label, init);
			if (create_cb) {
				create_cb(datachannel);
			}
		}
		return datachannel;

	};

	PeerCall.prototype.close = function() {

		if (this.closed) {
			return;
		}

		this.closed = true;

		_.each(this.datachannels, function(datachannel) {
			datachannel.close();
		});
		this.datachannels = {};
		this.streams = {};

		if (this.peerconnection) {
			this.peerconnection.close();
			this.peerconnection = null;
		}

		console.log("Peercall close", this);
		this.e.triggerHandler("closed", [this]);

	};

	return PeerCall;

});
