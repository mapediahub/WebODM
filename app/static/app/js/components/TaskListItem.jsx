import React from 'react';
import '../css/TaskListItem.scss';
import Console from '../Console';
import statusCodes from '../classes/StatusCodes';
import pendingActions from '../classes/PendingActions';
import ErrorMessage from './ErrorMessage';
import EditTaskPanel from './EditTaskPanel';
import AssetDownloadButtons from './AssetDownloadButtons';
import HistoryNav from '../classes/HistoryNav';
import PropTypes from 'prop-types';
import TaskPluginActionButtons from './TaskPluginActionButtons';
import PipelineSteps from '../classes/PipelineSteps';
import Css from '../classes/Css';
import Trans from './Trans';
import { _, interpolate } from '../classes/gettext';

class TaskListItem extends React.Component {
  static propTypes = {
      history: PropTypes.object.isRequired,
      data: PropTypes.object.isRequired, // task json
      refreshInterval: PropTypes.number, // how often to refresh info
      onDelete: PropTypes.func
  }

  constructor(props){
    super();

    this.historyNav = new HistoryNav(props.history);

    this.state = {
      expanded: this.historyNav.isValueInQSList("project_task_expanded", props.data.id),
      task: {},
      time: props.data.processing_time,
      actionError: "",
      actionButtonsDisabled: false,
      editing: false,
      memoryError: false,
      friendlyTaskError: "",
      pluginActionButtons: [],
      view: "basic"
    }

    for (let k in props.data){
      this.state.task[k] = props.data[k];
    }

    this.toggleExpanded = this.toggleExpanded.bind(this);
    this.consoleOutputUrl = this.consoleOutputUrl.bind(this);
    this.stopEditing = this.stopEditing.bind(this);
    this.startEditing = this.startEditing.bind(this);
    this.checkForCommonErrors = this.checkForCommonErrors.bind(this);
    this.handleEditTaskSave = this.handleEditTaskSave.bind(this);
    this.setView = this.setView.bind(this);

    // Retrieve CSS values for status bar colors
    this.backgroundSuccessColor = Css.getValue('theme-background-success', 'backgroundColor');
    this.backgroundFailedColor = Css.getValue('theme-background-failed', 'backgroundColor');
  }

  shouldRefresh(){
    if (this.state.task.pending_action !== null) return true;

    // If a task is completed, or failed, etc. we don't expect it to change
    if ([statusCodes.COMPLETED, statusCodes.FAILED, statusCodes.CANCELED].indexOf(this.state.task.status) !== -1) return false;

    return (([statusCodes.QUEUED, statusCodes.RUNNING, null].indexOf(this.state.task.status) !== -1 && this.state.task.processing_node) ||
            (!this.state.task.uuid && this.state.task.processing_node && !this.state.task.last_error));
  }

  loadTimer(startTime){
    if (!this.processingTimeInterval){
      this.setState({time: startTime});

      this.processingTimeInterval = setInterval(() => {
        this.setState({time: this.state.time += 1000});
      }, 1000);
    }
  }

  setView(type){
      return () => {
          this.setState({view: type});
      }
  }

  unloadTimer(){
    if (this.processingTimeInterval){
        clearInterval(this.processingTimeInterval);
        this.processingTimeInterval = null;
    }
    if (this.state.task.processing_time) this.setState({time: this.state.task.processing_time});
  }

  componentDidMount(){
    if (this.shouldRefresh()) this.refreshTimeout = setTimeout(() => this.refresh(), this.props.refreshInterval || 3000);

    // Load timer if we are in running state
    if (this.state.task.status === statusCodes.RUNNING) this.loadTimer(this.state.task.processing_time);
  }

  refresh(){
    // Fetch
    this.refreshRequest = $.getJSON(`/api/projects/${this.state.task.project}/tasks/${this.state.task.id}/`, json => {
      if (json.id){
        let oldStatus = this.state.task.status;

        this.setState({task: json, actionButtonsDisabled: false});

        // Update timer if we switched to running
        if (oldStatus !== this.state.task.status){
          if (this.state.task.status === statusCodes.RUNNING){
            if (this.console) this.console.clear();
            if (this.basicView) this.basicView.reset();
            this.loadTimer(this.state.task.processing_time);
          }else{
            this.setState({time: this.state.task.processing_time});
            this.unloadTimer();
          }

          if (this.state.task.status !== statusCodes.FAILED){
            this.setState({memoryError: false, friendlyTaskError: ""});
          }
        }
      }else{
        console.warn("Cannot refresh task: " + json);
      }

      this.setAutoRefresh();
    })
    .fail(( _, __, errorThrown) => {
      if (errorThrown === "Not Found"){ // Don't translate this one
        // Assume this has been deleted
        if (this.props.onDelete) this.props.onDelete(this.state.task.id);
      }else{
        this.setAutoRefresh();
      }
    });
  }

  setAutoRefresh(){
    if (this.shouldRefresh()) this.refreshTimeout = setTimeout(() => this.refresh(), this.props.refreshInterval || 3000);
  }

  componentWillUnmount(){
    this.unloadTimer();
    if (this.refreshRequest) this.refreshRequest.abort();
    if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
  }

  toggleExpanded(){
    const expanded = !this.state.expanded;

    this.historyNav.toggleQSListItem("project_task_expanded", this.props.data.id, expanded);

    this.setState({
      expanded: expanded
    });
  }

  consoleOutputUrl(line){
    return `/api/projects/${this.state.task.project}/tasks/${this.state.task.id}/output/?line=${line}`;
  }

  hoursMinutesSecs(t){
    if (t === 0 || t === -1) return "-- : -- : --";

    let ch = 60 * 60 * 1000,
          cm = 60 * 1000,
          h = Math.floor(t / ch),
          m = Math.floor( (t - h * ch) / cm),
          s = Math.round( (t - h * ch - m * cm) / 1000),
          pad = function(n){ return n < 10 ? '0' + n : n; };
    if( s === 60 ){
      m++;
      s = 0;
    }
    if( m === 60 ){
      h++;
      m = 0;
    }
    return [pad(h), pad(m), pad(s)].join(':');
  }

  genActionApiCall(action, options = {}){
    return () => {
      const doAction = () => {
        this.setState({actionButtonsDisabled: true});

        let url = `/api/projects/${this.state.task.project}/tasks/${this.state.task.id}/${action}/`;
        $.post(url,
          {
            uuid: this.state.task.uuid
          }
        ).done(json => {
            if (json.success){
              this.refresh();
              if (options.success !== undefined) options.success();
            }else{
              this.setState({
                actionError: json.error || options.defaultError || _("Cannot complete operation."),
                actionButtonsDisabled: false
              });
            }
        })
        .fail(() => {
            this.setState({
              actionError: options.defaultError || _("Cannot complete operation."),
              actionButtonsDisabled: false
            });
        });
      }

      if (options.confirm){
        if (window.confirm(options.confirm)){
          doAction();
        }
      }else{
        doAction();
      }
    };
  }

  optionsToList(options){
    if (!Array.isArray(options)) return "";
    else if (options.length === 0) return "Default";
    else {
      return options.map(opt => `${opt.name}: ${opt.value}`).join(", ");
    }
  }

  startEditing(){
    this.setState({expanded: true, editing: true});
  }

  stopEditing(){
    this.setState({editing: false});
  }

  checkForCommonErrors(lines){
    for (let line of lines){
      if (line.indexOf("Killed") !== -1 ||
          line.indexOf("MemoryError") !== -1 ||
          line.indexOf("std::bad_alloc") !== -1 ||
          line.indexOf("Child returned 137") !== -1 ||
          line.indexOf("loky.process_executor.TerminatedWorkerError:") !== -1 ||
          line.indexOf("Failed to allocate memory") !== -1){
        this.setState({memoryError: true});
      }else if (line.indexOf("SVD did not converge") !== -1 || 
                line.indexOf("0 partial reconstructions in total") !== -1){
        this.setState({friendlyTaskError: interpolate(_("It looks like there might be one of the following problems: %(problems)s You can read more about best practices for capturing good images %(link)s."), { problems: `<ul>
          <li>${_("Not enough images")}</li>
          <li>${_("Not enough overlap between images")}</li>
          <li>${_("Images might be too blurry (common with phone cameras)")}</li>
          <li>${_("The min-num-features task option is set too low, try increasing it by 25%")}</li>
        </ul>`, link: `<a href='https://support.dronedeploy.com/v1.0/docs/making-successful-maps' target='_blank'>${_("here")}</a>`})});
      }else if (line.indexOf("Illegal instruction") !== -1 ||
                line.indexOf("Child returned 132") !== -1){
        this.setState({friendlyTaskError: interpolate(_("It looks like this computer might be too old. WebODM requires a computer with a 64-bit CPU supporting MMX, SSE, SSE2, SSE3 and SSSE3 instruction set support or higher. You can still run WebODM if you compile your own docker images. See %(link)s for more information."), { link: `<a href='https://github.com/OpenDroneMap/WebODM#common-troubleshooting'>${_("this page")}</a>` } )});
      }else if (line.indexOf("Child returned 127") !== -1){
        this.setState({friendlyTaskError: _("The processing node is missing a program necessary to complete the task. This might indicate a corrupted installation. If you built OpenDroneMap, please check that all programs built without errors.")});
      }
    }
  }

  isMacOS(){
    return window.navigator.platform === "MacIntel";
  }

  handleEditTaskSave(task){
    this.setState({task, editing: false});
    this.setAutoRefresh();
  }

  getRestartSubmenuItems(){
    const { task } = this.state;

    // Map rerun-from parameters to display items
    const rfMap = {};
    PipelineSteps.get().forEach(rf => rfMap[rf.action] = rf);

    // Create onClick handlers
    for (let rfParam in rfMap){
      rfMap[rfParam].label = interpolate(_("From %(stage)s"), { stage: rfMap[rfParam].label});
      rfMap[rfParam].onClick = this.genRestartAction(rfParam);
    }

    let items = task.can_rerun_from
            .map(rf => rfMap[rf])
            .filter(rf => rf !== undefined);

    if (items.length > 0 && [statusCodes.CANCELED, statusCodes.FAILED].indexOf(task.status) !== -1){
        // Add resume "pseudo button" to help users understand
        // how to resume a task that failed for memory/disk issues.
        items.unshift({
            label: _("Resume Processing"),
            icon: "fa fa-bolt",
            onClick: this.genRestartAction(task.can_rerun_from[task.can_rerun_from.length - 1])
        });
    }

    return items;
  }

  genRestartAction(rerunFrom = null){
    const { task } = this.state;

    const restartAction = this.genActionApiCall("restart", {
        success: () => {
            this.setState({time: -1});
        },
        defaultError: _("Cannot restart task.")
      }
    );

    const setTaskRerunFrom = (value) => {
      this.setState({actionButtonsDisabled: true});

      // Removing rerun-from?
      if (value === null){
        task.options = task.options.filter(opt => opt['name'] !== 'rerun-from');
      }else{
        // Adding rerun-from
        let opt = null;
        if (opt = task.options.find(opt => opt['name'] === 'rerun-from')){
          opt['value'] = value;
        }else{
          // Not in existing list of options, append
          task.options.push({
            name: 'rerun-from',
            value: value
          });
        }
      }

      let data = {
        options: task.options
      };

      // Force reprocess
      if (value === null) data.uuid = '';

      return $.ajax({
          url: `/api/projects/${task.project}/tasks/${task.id}/`,
          contentType: 'application/json',
          data: JSON.stringify(data),
          dataType: 'json',
          type: 'PATCH'
        }).done((taskJson) => {
            this.setState({task: taskJson});
          })
          .fail(() => {
            this.setState({
              actionError: interpolate(_("Cannot restart task from (stage)s."), { stage: value || "the start"}),
              actionButtonsDisabled: false
            });
          });
    };

    return () => {
      setTaskRerunFrom(rerunFrom)
        .then(restartAction);
    };
  }

  render() {
    const task = this.state.task;
    const name = task.name !== null ? task.name : interpolate(_("Task #%(number)s"), { number: task.id });
    const imported = task.import_url !== "";

    let status = statusCodes.description(task.status);
    if (status === "") status = _("Uploading images to processing node");

    if (!task.processing_node && !imported) status = _("Waiting for a node...");
    if (task.pending_action !== null) status = pendingActions.description(task.pending_action);


    let expanded = "";
    if (this.state.expanded) {
      let showOrthophotoMissingWarning = false,
          showMemoryErrorWarning = this.state.memoryError && task.status == statusCodes.FAILED,
          showTaskWarning = this.state.friendlyTaskError !== "" && task.status == statusCodes.FAILED,
          showExitedWithCodeOneHints = task.last_error === "Process exited with code 1" &&
                                       !showMemoryErrorWarning &&
                                       !showTaskWarning &&
                                       task.status == statusCodes.FAILED,
          memoryErrorLink = this.isMacOS() ? "http://stackoverflow.com/a/39720010" : "https://docs.docker.com/docker-for-windows/#advanced";

      let actionButtons = [];
      const addActionButton = (label, className, icon, onClick, options = {}) => {
        actionButtons.push({
          className, icon, label, onClick, options
        });
      };

      
      if (task.status === statusCodes.COMPLETED){
        if (task.available_assets.indexOf("orthophoto.tif") !== -1){
          addActionButton(" " + _("View Map"), "btn-primary", "fa fa-globe", () => {
            location.href = `/map/project/${task.project}/task/${task.id}/`;
          });
        }else{
          showOrthophotoMissingWarning = true;
        }

        addActionButton(" " + _("View 3D Model"), "btn-primary", "fa fa-cube", () => {
          location.href = `/3d/project/${task.project}/task/${task.id}/`;
        });
      }

      // Ability to change options
      if ([statusCodes.FAILED, statusCodes.COMPLETED, statusCodes.CANCELED].indexOf(task.status) !== -1 ||
          (!task.processing_node)){
        addActionButton(_("Edit"), "btn-primary pull-right edit-button", "glyphicon glyphicon-pencil", () => {
          this.startEditing();
        }, {
          className: "inline"
        });
      }

      if ([statusCodes.QUEUED, statusCodes.RUNNING, null].indexOf(task.status) !== -1 &&
          (task.processing_node || imported)){
        addActionButton(_("Cancel"), "btn-primary", "glyphicon glyphicon-remove-circle", this.genActionApiCall("cancel", {defaultError: _("Cannot cancel task.")}));
      }

      if ([statusCodes.FAILED, statusCodes.COMPLETED, statusCodes.CANCELED].indexOf(task.status) !== -1 &&
            task.processing_node &&
            !imported){
          // By default restart reruns every pipeline
          // step from the beginning
          const rerunFrom = task.can_rerun_from.length > 1 ?
                              task.can_rerun_from[1] :
                              null;

          addActionButton(_("Restart"), "btn-primary", "glyphicon glyphicon-repeat", this.genRestartAction(rerunFrom), {
            subItems: this.getRestartSubmenuItems()
          });
      }

      addActionButton(_("Delete"), "btn-danger", "glyphicon glyphicon-trash", this.genActionApiCall("remove", {
        confirm: _("All information related to this task, including images, maps and models will be deleted. Continue?"),
        defaultError: _("Cannot delete task.")
      }));

      const disabled = this.state.actionButtonsDisabled || 
                    ([pendingActions.CANCEL,
                      pendingActions.REMOVE, 
                      pendingActions.RESTART].indexOf(task.pending_action) !== -1);

      actionButtons = (<div className="action-buttons">
            {task.status === statusCodes.COMPLETED ?
          <AssetDownloadButtons task={this.state.task} disabled={disabled} buttonClass="db-btn" />
            : ""}
            {actionButtons.map(button => {
              const subItems = button.options.subItems || [];
              const className = button.options.className || "";

              let buttonHtml = (<button type="button" className={"btn btn-sm " + button.className} onClick={button.onClick} disabled={disabled}>
                                <i className={button.icon}></i>
                                {button.label}
                            </button>);
              if (subItems.length > 0){
                  // The button expands sub items
                  buttonHtml = (<button type="button" className={"btn btn-sm " + button.className} data-toggle="dropdown" disabled={disabled}>
                        <i className={button.icon}></i>
                        {button.label}
                    </button>);
              }

              return (
                  <div key={button.label} className={"inline-block " +
                                  (subItems.length > 0 ? "btn-group" : "") + " " +
                                  className}>
                    {buttonHtml}
                    {subItems.length > 0 &&
                      [<button key="dropdown-button"
                              disabled={disabled}
                              type="button"
                              className={"btn btn-sm dropdown-toggle "  + button.className}
                              data-toggle="dropdown"><span className="caret"></span></button>,
                      <div key="dropdown-menu" className="dropdown-menu db-dropdown-menu">
                        {subItems.map(subItem => <div key={subItem.label} className="dropdown-item" onClick={subItem.onClick}>
                             <i className={subItem.icon + ' fa-fw '}></i>&nbsp;{subItem.label}
                          </div>)}
                      </div>]}
                  </div>);
            })}
          </div>);

      const stats = task.statistics;
    
      expanded = (
        <div className="expanded-panel">
          <hr/>
          <div className="row">
            <div className="col-md-12 no-padding">

              <div className="console-switch d-flex flex-row justify-content-end align-items-center">
                  <div className="console-output-label">{_("Task Output:")}</div>
                  <div class="btn-group small rounded console-output-btns" role="group" aria-label="Basic example">
                  <button onClick={this.setView("console")} type="button" class={"btn " + (this.state.view === "console" ? "active" : "")}>
                      <span className="px-3">{_("On")}</span>
                  </button>
                  <button onClick={this.setView("basic")} type="button" class={"btn " + (this.state.view === "basic" ? "active" : "")}>
                      <span className="px-3">{_("Off")}</span>
                  </button>
                  </div>
              </div>
              
              <div className="mb task-info">
              {
                  (() => {
                    const data = [
                        {
                            label: _("Created on: "),
                            value: (new Date(task.created_at)).toLocaleString()
                        },
                        {
                            label: _("Processing Node: "),
                            value: task.processing_node_name || "-"
                        }
                    ]

                    if (Array.isArray(task.options)) {
                      data.push({
                        label: _("Options: "),
                        value: this.optionsToList(task.options)
                      })
                    }

                    if (stats && stats.gsd) {
                      data.push({
                        label: _("Average GSD: "),
                        value: stats.gsd.toFixed(2) + " cm"
                      },
                      {
                        label: _("Area:"),
                        value: stats.area.toFixed(2) + " m"
                      },
                      {
                        label: _("Reconstructed Points:"),
                        value: stats.pointcloud.points.toLocaleString()
                      })
                    }

                    return data.map((d, i) => (
                        <div className="labels" key={"info-" + i}>
                          <strong>{ d.label }&nbsp;:&nbsp;&nbsp;</strong>
                          <span className="task-value">{ d.value }</span>
                        </div>
                    ))
                  })()
              }
              </div>
              
              {
                this.state.view === "console" &&
                <Console
                    className="floatfix"
                    source={this.consoleOutputUrl}
                    refreshInterval={this.shouldRefresh() ? 3000 : undefined}
                    autoscroll={true}
                    height={200}
                    ref={domNode => this.console = domNode}
                    onAddLines={this.checkForCommonErrors}
                    showConsoleButtons={true}
                    maximumLines={500}
                />
              }

              {showOrthophotoMissingWarning ?
              <div className="task-warning"><i className="fa fa-warning"></i> <span>{_("An orthophoto could not be generated. To generate one, make sure GPS information is embedded in the EXIF tags of your images, or use a Ground Control Points (GCP) file.")}</span></div> : ""}

              {showMemoryErrorWarning ?
              <div className="task-warning"><i className="fa fa-support"></i> <Trans params={{ memlink: `<a href="${memoryErrorLink}" target='_blank'>${_("enough RAM allocated")}</a>`, cloudlink: `<a href='https://www.opendronemap.org/webodm/lightning/' target='_blank'>${_("cloud processing node")}</a>` }}>{_("It looks like your processing node ran out of memory. If you are using docker, make sure that your docker environment has %(memlink)s. Alternatively, make sure you have enough physical RAM, reduce the number of images, make your images smaller, or reduce the max-concurrency parameter from the task's options. You can also try to use a %(cloudlink)s.")}</Trans></div> : ""}

              {showTaskWarning ?
              <div className="task-warning"><i className="fa fa-support"></i> <span dangerouslySetInnerHTML={{__html: this.state.friendlyTaskError}} /></div> : ""}

              {showExitedWithCodeOneHints ?
              <div className="task-warning"><i className="fa fa-info-circle"></i> <div className="inline">
                  <Trans params={{link1: `<a href="https://www.dronedb.app/" target="_blank">DroneDB</a>`, link2: `<a href="https://drive.google.com/drive/u/0/" target="_blank">Google Drive</a>`, open_a_topic: `<a href="http://community.opendronemap.org/c/webodm" target="_blank">${_("open a topic")}</a>`, }}>{_("\"Process exited with code 1\" means that part of the processing failed. Sometimes it's a problem with the dataset, sometimes it can be solved by tweaking the Task Options and sometimes it might be a bug! If you need help, upload your images somewhere like %(link1)s or %(link2)s and %(open_a_topic)s on our community forum, making sure to include a copy of your task's output. Our awesome contributors will try to help you!")}</Trans> <i className="far fa-smile"></i>
                </div>
              </div>
              : ""}
            </div>
          </div>
          <div className="row clearfix">
            <ErrorMessage bind={[this, 'actionError']} />
            {actionButtons}
          </div>
          <TaskPluginActionButtons task={task} disabled={disabled} />
        </div>
      );

      // If we're editing, the expanded view becomes the edit panel
      if (this.state.editing){
        expanded = <div className="task-list-item">
          <div className="row no-padding">
            <EditTaskPanel
              task={this.state.task}
              onSave={this.handleEditTaskSave}
              onCancel={this.stopEditing}
            />
          </div>
        </div>;
      }
    }

    // @param type {String} one of: ['neutral', 'done', 'error']
    const getStatusLabel = (text, type = 'neutral', progress = 100) => {

      let clazz = "status-neutral"
      if (type === "done") {
        clazz = "status-done"
      } else if (type === "error") {
        clazz = "status-error"
      }

      return (
        <div className={"badge badge-pill task-status " + clazz}>{ text }</div>
      )
    }

    let statusLabel = "";
    let statusIcon = statusCodes.icon(task.status);
    let showEditLink = false;

    if (task.last_error){
      statusLabel = getStatusLabel(task.last_error, 'error');
    }else if (!task.processing_node && !imported){
      statusLabel = getStatusLabel(_("Set a processing node"));
      statusIcon = "fa fa-hourglass-3";
      showEditLink = true;
    }else if (task.partial && !task.pending_action){
      statusIcon = "fa fa-hourglass-3";
      statusLabel = getStatusLabel(_("Waiting for image upload..."));
    }else{
      let progress = 100;
      let type = 'done';

      if (task.pending_action === pendingActions.RESIZE){
          progress = task.resize_progress * 100;
      }else if (task.status === null){
          progress = task.upload_progress * 100;
      }else if (task.status === statusCodes.RUNNING){
          progress = task.running_progress * 100;
      }else if (task.status === statusCodes.FAILED){
          type = 'error';
      }else if (task.status !== statusCodes.COMPLETED){
          type = 'neutral';
      }

      statusLabel = getStatusLabel(status, type, progress);
    }

    return (
      <div className="task-list-item card">
        <div className="row mt-0 task-header align-items-center">
          <div className="col-sm-5 name">
            <div className="d-flex flex-row task-name hover underline align-items-center" onClick={this.toggleExpanded}>
              <i className={"clickable far " + (this.state.expanded ? "fa-minus-square" : " fa-plus-square")}></i>
              <span>&nbsp;&nbsp;{name}</span>
            </div>
          </div>
          <div className="col-sm-1 details">
            <i className="far fa-image"></i> {task.images_count}
          </div>
          <div className="col-sm-2 details">
            <i className="far fa-clock"></i> {this.hoursMinutesSecs(this.state.time)}
          </div>
          <div className="col-sm-3">
            {
              showEditLink ?
              <div className="hover" onClick={this.startEditing}>{statusLabel}</div>
              :
              statusLabel
            }
          </div>
          <div className="col-sm-1 text-right">
            <div className="status-icon">
              <i className={statusIcon}></i>
            </div>
          </div>
        </div>
        {expanded}
      </div>
    );
  }
}

export default TaskListItem;
