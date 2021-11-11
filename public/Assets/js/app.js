var AppProcess = (function () {
  var peers_connection_ids = [];
  var peers_connection = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];
  var local_div;
  var videoCamTrack;

  var rtp_aud_senders = [];
  var rtp_vid_senders = [];
  var video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var video_st = video_states.None;

  var serverProcess;
  var audio;
  var isAudioMute = true;

  async function _init(SDP_function, my_connId) {
    serverProcess = SDP_function;
    my_connection_id = my_connId;
    eventProcess();
    local_div = document.getElementById("localVideoPlayer");
  }
  function eventProcess() {
    $("#micMuteUnmute").on("click", async function () {
      if (!audio) {
        await loadAudio();
      }
      if (!audio) {
        alert("Audio permission has not granted");
        return;
      }
      if (isAudioMute) {
        audio.enabled = true;
        $(this).html(
          "<span class='material-icons' style='width: 100%;'>mic</span>"
        );
        updateMediaSenders(audio, rtp_aud_senders);
      } else {
        audio.enabled = false;
        $(this).html(
          "<span class='material-icons' style='width: 100%;'>mic_off</span>"
        );
        removeMediaSenders(rtp_aud_senders);
      }
      isAudioMute = !isAudioMute;
    });
    $("#videoCamOnOff").on("click", async function () {
      if (video_st == video_states.Camera) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.Camera);
      }
    });
    $("#btnScreenShareOnOff").on("click", async function () {
      if (video_st == video_states.ScreenShare) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.ScreenShare);
      }
    });
  }

  async function loadAudio() {
    try {
      var astream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      audio = astream.getAudioTracks()[0];
      audio.enabled = false;
    } catch (e) {
      console.log(e);
    }
  }

  function connection_status(connection) {
    if (
      connection &&
      (connection.connectionState == "new" ||
        connection.connectionState == "connecting" ||
        connection.connectionState == "connected")
    ) {
      return true;
    } else {
      return false;
    }
  }
  async function updateMediaSenders(track, rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          rtp_senders[con_id].replaceTrack(track);
        } else {
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      }
    }
  }

  function removeMediaSenders(rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (rtp_senders[con_id] && connection_status(peers_connection[con_id])) {
        peers_connection[con_id].removeTrack(rtp_senders[con_id]);
        rtp_senders[con_id] = null;
      }
    }
  }

  function removeVideoStream(rtp_vid_senders) {
    if (videoCamTrack) {
      videoCamTrack.stop();
      videoCamTrack = null;
      local_div.srcObject = null;
      removeMediaSenders(rtp_vid_senders);
    }
  }

  async function videoProcess(newVideoState) {
    if (newVideoState == video_states.None) {
      $("#videoCamOnOff").html(
        "<span class='material-icons' style='width: 100%;'>videocam_off</span>"
      );
      $("#btnScreenShareOnOff").html(
        '<span class="material-icons">present_to_all</span><div>Present Now</div>'
      );
      video_st = newVideoState;
      removeVideoStream(rtp_vid_senders);
      return;
    }
    if (newVideoState == video_states.Camera) {
      $("#videoCamOnOff").html(
        "<span class='material-icons' style='width: 100%;'>videocam_on</span>"
      );
    }

    try {
      var vstream = null;
      if (newVideoState == video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
      } else if (newVideoState == video_states.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
        vstream.oninactive = (e) => {
          removeVideoStream(rtp_vid_senders);
          $("#btnScreenShareOnOff").html(
            '<span class="material-icons">present_to_all</span><div>Present Now</div>'
          );
        };
      }
      if (vstream && vstream.getVideoTracks().length > 0) {
        videoCamTrack = vstream.getVideoTracks()[0];
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack]);
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }
    } catch (e) {
      console.log(e);
      return;
    }
    video_st = newVideoState;
    if (newVideoState == video_states.Camera) {
      $("#videoCamOnOff").html(
        '<span class="material-icons" style="width: 100%;">videocam</span>'
      );
      $("#btnScreenShareOnOff").html(
        '<span class="material-icons">present_to_all</span><div>Present Now</div>'
      );
    } else if (newVideoState == video_states.ScreenShare) {
      $("#btnScreenShareOnOff").html(
        '<span class="material-icons text-success">present_to_all</span><div class="text-success">Stop Presentation</div>'
      );
    }
  }

  var iceConfiguration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:stun1.l.google.com:19302",
      },
    ],
  };

  async function setConnection(connId) {
    var connection = new RTCPeerConnection(iceConfiguration);

    connection.onnegotiationneeded = async function (event) {
      await setOffer(connId);
    };
    connection.onicecandidate = function (event) {
      if (event.candidate) {
        serverProcess(
          JSON.stringify({ icecandidate: event.candidate }),
          connId
        );
      }
    };
    connection.ontrack = function (event) {
      if (!remote_vid_stream[connId]) {
        remote_vid_stream[connId] = new MediaStream();
      }
      if (!remote_aud_stream[connId]) {
        remote_aud_stream[connId] = new MediaStream();
      }

      if (event.track.kind == "video") {
        remote_vid_stream[connId]
          .getVideoTracks()
          .forEach((t) => remote_vid_stream[connId].removeTrack(t));
        remote_vid_stream[connId].addTrack(event.track);
        var remoteVideoPlayer = document.getElementById("v_" + connId);
        remoteVideoPlayer.srcObject = null;
        remoteVideoPlayer.srcObject = remote_vid_stream[connId];
        remoteVideoPlayer.load();
      } else if (event.track.kind == "audio") {
        remote_aud_stream[connId]
          .getAudioTracks()
          .forEach((t) => remote_aud_stream[connId].removeTrack(t));
        remote_aud_stream[connId].addTrack(event.track);
        var remoteAudioPlayer = document.getElementById("a_" + connId);
        remoteAudioPlayer.srcObject = null;
        remoteAudioPlayer.srcObject = remote_aud_stream[connId];
        remoteAudioPlayer.load();
      }
    };
    peers_connection_ids[connId] = connId;
    peers_connection[connId] = connection;

    if (
      video_st == video_states.Camera ||
      video_st == video_states.ScreenShare
    ) {
      if (videoCamTrack) {
        updateMediaSenders(videoCamTrack, rtp_vid_senders);
      }
    }

    return connection;
  }

  async function setOffer(connId) {
    var connection = peers_connection[connId];
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    serverProcess(
      JSON.stringify({
        offer: connection.localDescription,
      }),
      connId
    );
  }

  async function SDPProcess(message, from_connid) {
    message = JSON.parse(message);
    if (message.answer) {
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );
      var answer = await peers_connection[from_connid].createAnswer();
      await peers_connection[from_connid].setLocalDescription(answer);
      serverProcess(
        JSON.stringify({
          answer: answer,
        }),
        from_connid
      );
    } else if (message.icecandidate) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      try {
        await peers_connection[from_connid].addIceCandidate(
          message.icecandidate
        );
      } catch (e) {
        console.log(e);
      }
    }
  }

  async function closeConnection(connId) {
    peers_connection_ids[connId] = null;
    if (peers_connection[connId]) {
      peers_connection[connId].close();
      peers_connection[connId] = null;
    }
    if (remote_aud_stream[connId]) {
      remote_aud_stream[connId].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remote_aud_stream[connId] = null;
    }
    if (remote_vid_stream[connId]) {
      remote_vid_stream[connId].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remote_vid_stream[connId] = null;
    }
  }

  return {
    setNewConnection: async function (connId) {
      await setConnection(connId);
    },
    init: async function (SDP_function, my_connId) {
      await _init(SDP_function, my_connId);
    },
    processClientFunc: async function (data, from_connid) {
      await SDPProcess(data, from_connid);
    },
    closeConnectionCall: async function (connId) {
      await closeConnection(connId);
    },
  };
})();
var MyApp = (function () {
  var socket = null;
  var user_id = "";
  var meeting_id = "";
  function init(uid, mid) {
    user_id = uid;
    meeting_id = mid;
    $("#meetingContainer").show();
    $("#me h2").text(user_id + "(Me)");
    document.title = user_id;
    event_process_for_signaling_server();
    eventHandeling();
  }

  var socket = null;

  function event_process_for_signaling_server() {
    socket = io.connect();

    var SDP_function = function (data, to_connId) {
      socket.emit("SDPProcess", {
        message: data,
        to_connId: to_connId,
      });
    };
    socket.on("connect", () => {
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);
        if (user_id != "" && meeting_id != "") {
          socket.emit("userconnect", {
            displayName: user_id,
            meetingid: meeting_id,
            
          });
        }
      }
    });

    socket.on("inform_other_about_disconnected_user", function (data) {
      $("#" + data.connId).remove();
      $(".participant-count").text(data.uNumber);
      $("#participant_" + data.connId + "").remove();
      AppProcess.closeConnectionCall(data.connId);
    });

    socket.on("inform_others_about_me", function (data) {
      addUser(data.other_users_id, data.connId, data.userNumber);
      AppProcess.setNewConnection(data.connId);
    });
    socket.on("showFileMessage", function (data) {
      var time = new Date();
      var lTime = time.toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
      var attachFileAreaForOther = document.querySelector(".show-attach-file");
      attachFileAreaForOther.innerHTML +=
        "<div class='left-align' style='display:flex; align-items:center;'><img src='public/assets/images/other.jpg' style='height:40px; width:40px;' class='caller-image circle'><div style='font-weight:600;margin:0 5px;'>" +
        data.username +
        "</div>:<div><a style='color:#007bff;'href='" +
        data.filePath +
        "'download>" +
        data.fileName +
        "</a></div></div><br/>";
    });
    socket.on("inform_me_about_other_user", function (other_users) {
      var userNumber = other_users.length;
      var userNumb = userNumber + 1;
      if (other_users) {
        for (var i = 0; i < other_users.length; i++) {
          addUser(
            other_users[i].user_id,
            other_users[i].connectionId,
            userNumb
          );
          AppProcess.setNewConnection(other_users[i].connectionId);
        }
      }
    });
    socket.on("SDPProcess", async function (data) {
      await AppProcess.processClientFunc(data.message, data.from_connid);
    });
    socket.on("showChatMessage", function (data) {
      var time = new Date();
      var lTime = time.toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
      var div = $("<div>").html(
        "<span class='font-weight-bold mr-3' style='color:black'>" +
          data.from +
          "</span>" +
          lTime +
          "</br>" +
          data.message
      );
      $("#messages").append(div);
    });
  }

  function eventHandeling() {
    $("#btnsend").on("click", function () {
      var msgData = $("#msgbox").val();
      socket.emit("sendMessage", msgData);
      var time = new Date();
      var lTime = time.toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });
      var div = $("<div>").html(
        "<span class='font-weight-bold mr-3' style='color:black'>" +
          user_id +
          "</span>" +
          lTime +
          "</br>" +
          msgData
      );
      $("#messages").append(div);
      $("#msgbox").val("");
    });

    var url = window.location.href;
    $(".meeting_url").text(url);

    $("#divUsers").on("dblclick", "video", function () {
      this.requestFullscreen();
    });
  }

  function addUser(other_users_id, connId, userNum) {
    var newDivId = $("#otherTemplate").clone();
    newDivId = newDivId.attr("id", connId).addClass("other");
    newDivId.find("h2").text(other_users_id);
    newDivId.find("video").attr("id", "v_" + connId);
    newDivId.find("audio").attr("id", "a_" + connId);
    newDivId.show();
    $("#divUsers").append(newDivId);
    $(".in-call-wrap-up").append(
      '<div class="in-call-wrap d-flex justify-content-between align-items-center mb-3" id="participant_' +
        connId +
        '"> <div class="participant-img-name-wrap display-center cursor-pointer"> <div class="participant-img"> <img src="public/Assets//images/other.jpg" alt="" class="border border-secondary" style="height:40px; width:40px; border-radius: 50%;"> </div> <div class="participant-name ml-2"> ' +
        other_users_id +
        ' </div> </div> <div class="participant-action-wrap display-center"> <div class="participant-action-dot display-center mr-2 "> <span class="material-icons">more_vert</span> </div> <div class="participant-action-pin display-center mr-2 cursor-pointer"> <span class="material-icons">push_pin</span> </div> </div> </div>'
    );
    $(".participant-count").text(userNum);
  }

  $(document).on("click", ".people-heading", function () {
    $(".in-call-wrap-up").show(300);
    $(".chat-show-wrap").hide(300);
    $(this).addClass("active");
    $(".chat-heading").removeClass("active");
  });
  $(document).on("click", ".chat-heading", function () {
    $(".in-call-wrap-up").hide(300);
    $(".chat-show-wrap").show(300);
    $(this).addClass("active");
    $(".people-heading").removeClass("active");
  });
  $(document).on("click", ".meeting-heading-cross", function () {
    $(".g-right-details-wrap").hide(300);
  });
  $(document).on("click", ".top_left_participant_wrap", function () {
    $(".people-heading").addClass("active");
    $(".chat-heading").removeClass("active");
    $(".g-right-details-wrap").show(300);
    $(".in-call-wrap-up").show(300);
    $(".chat-show-wrap").hide(300);
  });
  $(document).on("click", ".top_left_chat_wrap", function () {
    $(".people-heading").removeClass("active");
    $(".chat-heading").addClass("active");
    $(".g-right-details-wrap").show(300);
    $(".in-call-wrap-up").hide(300);
    $(".chat-show-wrap").show(300);
  });
  $(document).on("click", ".end-call-wrap", function () {
    $(".top-box-show")
      .css({
        display: "block",
      })
      .html(
        '<div class="top-box align-vertical-middle profile-dialogue-show"> <h4 class="mt-2" style="text-align:center; color:white;">Leave Meeting</h4> <hr> <div class="call-leave-cancel-action d-flex justify-content-center align-items-center w-100"> <a href="/action.html"><button class="call-leave-action btn btn-danger mr-5">Leave </button></a> <button class="call-cancel-action btn btn-secondary">Cancel</button> </div> </div>'
      );
  });
  $(document).mouseup(function (e) {
    var container = new Array();
    container.push($(".top-box-show"));
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length == 0) {
        $(value).empty();
      }
    });
  });
  $(document).mouseup(function (e) {
    var container = new Array();
    container.push($(".g-details"));
    container.push($(".g-right-details-wrap"));
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length == 0) {
        $(value).hide(300);
      }
    });
  });

  $(document).on("click", ".call-cancel-action", function () {
    $(".top-box-show").html("");
  });

  $(document).on("click", ".copy_info", function () {
    var $temp = $("<input>");
    $("body").append($temp);
    $temp.val($(".meeting_url").text()).select();
    document.execCommand("copy");
    $temp.remove();
    $(".link-conf").show();
    setTimeout(function () {
      $(".link-conf").hide();
    }, 3000);
  });

  $(document).on("click", ".meeting-details-button", function () {
    $(".g-details").slideDown(300);
  });
  $(document).on("click", ".g-details-heading-attachment", function () {
    $(".g-details-heading-show").hide();
    $(".g-details-heading-show-attachment").show();
    $(this).addClass("active");
    $(".g-details-heading-detail").removeClass("active");
  });
  $(document).on("click", ".g-details-heading-detail", function () {
    $(".g-details-heading-show").show();
    $(".g-details-heading-show-attachment").hide();
    $(this).addClass("active");
    $(".g-details-heading-attachment").removeClass("active");
  });

  var base_url = window.location.origin;

  $(document).on("change", ".custom-file-input", function () {
    var fileName = $(this).val().split("\\").pop();
    $(this).siblings(".custom-file-label").addClass("selected").html(fileName);
  });

  $(document).on("click", ".share-attach", function (e) {
    e.preventDefault();
    var att_img = $("#customFile").prop("files")[0];
    var formData = new FormData();
    formData.append("zipfile", att_img);
    formData.append("meeting_id", meeting_id);
    formData.append("username", user_id);
    console.log(formData);
    $.ajax({
      url: base_url + "/attachimg",
      type: "POST",
      data: formData,
      contentType: false,
      processData: false,
      success: function (response) {
        console.log(response);
      },
      error: function () {
        console.log("error");
      },
    });

    var attachFileArea = document.querySelector(".show-attach-file");
    var attachFileName = $("#customFile").val().split("\\").pop();
    var attachFilePath =
      "public/attachment/" + meeting_id + "/" + attachFileName;
    attachFileArea.innerHTML +=
      "<div class='left-align' style='display:flex; align-items:center;'><img src='public/assets/images/other.jpg' style='height:40px; width:40px;' class='caller-image circle'><div style='font-weight:600;margin:0 5px;'>" +
      user_id +
      "</div>:<div><a style='color:#007bff;'href='" +
      attachFilePath +
      "'download>" +
      attachFileName +
      "</a></div></div><br/>";
    $("label.custom-file-label").text("");
    socket.emit("fileTransferToOther", {
      username: user_id,
      meetingid: meeting_id,
      filePath: attachFilePath,
      fileName: attachFileName,
    });
  });

  return {
    _init: function (uid, mid) {
      init(uid, mid);
    },
  };
})();

  function openWin() {

    myWindow = window.open("compiler.html", "myWindow", "width=1000,height=700"); 

}
