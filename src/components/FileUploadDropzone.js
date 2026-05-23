import React from 'react';
import PropTypes from "prop-types";
import Dropzone from 'react-dropzone';
import { Col } from 'react-bootstrap';

import { ReactComponent as UploadSVG } from "../assets/images/upload.svg";
import { ReactComponent as ErrorSVG } from "../assets/images/error.svg";

import styles from "components/styles/fileUploadDropzone.module.css";

class FileUploadDropzone extends React.Component {
    render() {
        const { uploadError, uploadingToIPFS, fileInput, onDrop, disabled } = this.props;

        return (
            <div className={styles.dropzoneDiv}>
                <Dropzone onDrop={onDrop} disabled={disabled}>
                    {({ getInputProps, getRootProps }) => (
                        <section className={styles["dropzone"]} style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
                            <div {...getRootProps()} className={styles["vertical-center"]}>
                                <input {...getInputProps()} />
                                <Col className={styles.uploadContent}>
                                    <UploadSVG />
                                    <p style={{ fontSize: "14px" }}>
                                        {(fileInput && fileInput.path) || (uploadingToIPFS && "Uploading to IPFS...") || (
                                            "Drop files here or click to select files (Max size: 20MB)"
                                        )}
                                    </p>
                                </Col>
                            </div>
                        </section>
                    )}
                </Dropzone>

                {uploadError && (
                    <p className={styles.dropzoneError}>
                        <ErrorSVG style={{ width: 16 }} />
                        {uploadError}
                    </p>
                )}

            </div>
        );
    }
}

FileUploadDropzone.propTypes = {
    uploadError: PropTypes.string,
    uploadingToIPFS: PropTypes.bool,
    fileInput: PropTypes.object,
    onDrop: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

// Default props (if needed)
FileUploadDropzone.defaultProps = {
    uploadError: '',
    uploadingToIPFS: false,
    fileInput: null,
};

export default FileUploadDropzone;
