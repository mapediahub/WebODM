import '../css/NewTaskPanel.scss';
import React from 'react';
import EditTaskForm from './EditTaskForm';
import PropTypes from 'prop-types';
import Storage from '../classes/Storage';
import ResizeModes from '../classes/ResizeModes';
import update from 'immutability-helper';
import PluginsAPI from '../classes/plugins/API';
import { _, interpolate } from '../classes/gettext';

class NewTaskPanel extends React.Component {
  static defaultProps = {
    filesCount: 0,
    showResize: false
  };

  static propTypes = {
      onSave: PropTypes.func.isRequired,
      onCancel: PropTypes.func,
      filesCount: PropTypes.number,
      showResize: PropTypes.bool,
      getFiles: PropTypes.func,
      suggestedTaskName: PropTypes.oneOfType([PropTypes.string, PropTypes.func])
  };

  constructor(props){
    super(props);

    this.state = {
      editTaskFormLoaded: false,
      resizeMode: Storage.getItem('resize_mode') === null ? ResizeModes.YES : ResizeModes.fromString(Storage.getItem('resize_mode')),
      resizeSize: parseInt(Storage.getItem('resize_size')) || 2048,
      items: [], // Coming from plugins,
      taskInfo: {},
      inReview: false,
      loading: false,
    };

    this.save = this.save.bind(this);
    this.handleFormTaskLoaded = this.handleFormTaskLoaded.bind(this);
    this.getTaskInfo = this.getTaskInfo.bind(this);
    this.setResizeMode = this.setResizeMode.bind(this);
    this.handleResizeSizeChange = this.handleResizeSizeChange.bind(this);
    this.handleFormChanged = this.handleFormChanged.bind(this);
  }

  componentDidMount(){
    PluginsAPI.Dashboard.triggerAddNewTaskPanelItem({}, (item) => {
        if (!item) return;

        this.setState(update(this.state, {
            items: {$push: [item]}
        }));
    });
  }

  save(e){
    if (!this.state.inReview){
      this.setState({inReview: true});
    }else{
      this.setState({inReview: false, loading: true});
      e.preventDefault();
      this.taskForm.saveLastPresetToStorage();
      Storage.setItem('resize_size', this.state.resizeSize);
      Storage.setItem('resize_mode', this.state.resizeMode);

      const taskInfo = this.getTaskInfo();
      if (taskInfo.selectedNode.key != "auto"){
        Storage.setItem('last_processing_node', taskInfo.selectedNode.id);
      }else{
        Storage.setItem('last_processing_node', '');
      }

      if (this.props.onSave) this.props.onSave(taskInfo);
    }
  }

  cancel = (e) => {
    if (this.state.inReview){
      this.setState({inReview: false});
    }else{
      if (this.props.onCancel){
        if (window.confirm(_("Are you sure you want to cancel?"))){
          this.props.onCancel();
        }
      }
    }
  }

  getTaskInfo(){
    return Object.assign(this.taskForm.getTaskInfo(), {
      resizeSize: this.state.resizeSize,
      resizeMode: this.state.resizeMode 
    });
  }

  setResizeMode(v){
    return e => {
      this.setState({resizeMode: v});

      setTimeout(() => {
          this.handleFormChanged();
      }, 0);
    }
  }

  handleResizeSizeChange(e){
    // Remove all non-digit characters
    let n = parseInt(e.target.value.replace(/[^\d]*/g, ""));
    if (isNaN(n)) n = "";
    this.setState({resizeSize: n});
    
    setTimeout(() => {
        this.handleFormChanged();
    }, 0);
  }

  handleFormTaskLoaded(){
    this.setState({editTaskFormLoaded: true});
  }

  handleFormChanged(){
    this.setState({taskInfo: this.getTaskInfo()});
  }

  render() {
    return (
      <div className="new-task-panel theme-background-highlight col-12">
        <div className="form-horizontal">
          <div className={this.state.inReview ? "disabled" : ""}>
            <p>{interpolate(_("%(count)s files selected. Please check these additional options:"), { count: this.props.filesCount})}</p>
            <EditTaskForm
              selectedNode={Storage.getItem("last_processing_node") || "auto"}
              onFormLoaded={this.handleFormTaskLoaded}
              onFormChanged={this.handleFormChanged}
              inReview={this.state.inReview}
              suggestedTaskName={this.props.suggestedTaskName}
              ref={(domNode) => { if (domNode) this.taskForm = domNode; }}
            />

            {this.state.editTaskFormLoaded && this.props.showResize ?
              <div>
                <div className="form-group row">
                  <label className="control-label col-2">{_("Resize Images")}</label>
                  <div className="col-10">
                      <div className="btn-group">
                        <button type="button" className="btn btn-secondary dropdown-toggle" data-toggle="dropdown">
                            {ResizeModes.toHuman(this.state.resizeMode)}&nbsp;<span className="caret"></span>
                        </button>
                        <div className="dropdown-menu db-dropdown-menu">
                            {ResizeModes.all().map(mode =>
                            <div key={mode} className={"dropdown-item " + (this.state.resizeMode === mode ? "active" : "")} onClick={this.setResizeMode(mode)}>
                              <i style={{opacity: this.state.resizeMode === mode ? 1 : 0}} className="fa fa-check"></i>&nbsp;{ResizeModes.toHuman(mode)}
                            </div>
                            )}
                        </div>
                      </div>
                      <div className={"resize-control " + (this.state.resizeMode === ResizeModes.NO ? "hide" : "")}>
                      <input 
                          type="number" 
                          step="100"
                          className="form-control db-input"
                          onChange={this.handleResizeSizeChange} 
                          value={this.state.resizeSize} 
                      />
                      <span className="pl-2">{_("px")}</span>
                      </div>
                  </div>
                </div>
                {this.state.items.map((Item, i) => <div key={i} className="form-group">
                  <Item taskInfo={this.state.taskInfo}
                        getFiles={this.props.getFiles}
                        filesCount={this.props.filesCount}
                      />
                </div>)}
              </div>
            : ""}
          </div>

          {this.state.editTaskFormLoaded ? 
            <div className="form-group">
              <hr/>
              <div className="d-flex justify-content-end">
                {this.props.onCancel !== undefined && <button type="submit" className="btn btn-danger" onClick={this.cancel} style={{marginRight: 4}}><i className="glyphicon glyphicon-remove-circle"></i> {_("Cancel")}</button>}
                {this.state.loading ?
                  <button type="submit" className="btn btn-primary" disabled={true}><i className="fa fa-circle-notch fa-spin fa-fw"></i>{_("Loading…")}</button>
                  :
                  <button type="submit" className="btn btn-primary" onClick={this.save} disabled={this.props.filesCount <= 1}><i className="glyphicon glyphicon-saved"></i> {!this.state.inReview ? _("Review") : _("Start Processing")}</button>
                }
              </div>
            </div>
            : ""}
        </div>
      </div>
    );
  }
}

export default NewTaskPanel;
