import React from 'react';
import PropTypes from "prop-types";
import Dropzone from 'react-dropzone';
import { Col } from 'react-bootstrap';

import { ReactComponent as UploadSVG } from "../assets/images/upload.svg";
import { ReactComponent as InfoSVG } from "../assets/images/info.svg";
import { ReactComponent as ErrorSVG } from "../assets/images/error.svg";

import styles from "components/styles/fileUploadDropzone.module.css";

class FileUploadDropzone extends React.Component {
    render() {
        const { uploadError, uploadingToIPFS, fileInput, onDrop } = this.props;

        return (
            <div className={styles.dropzoneDiv}>
                <Dropzone onDrop={onDrop}>
                    {({ getInputProps, getRootProps }) => (
                        <section className={styles["dropzone"]}>
                            <div {...getRootProps()} className={styles["vertical-center"]}>
                                <input {...getInputProps()} />
                                <Col className={styles.uploadContent}>
                                    <UploadSVG />
                                    <p style={{ fontSize: "14px" }}>
                                        {(fileInput && fileInput.path) || (uploadingToIPFS && "Uploading to IPFS...") || (
                                            "Drop files here or click to select files (Max size: 4MB)"
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

                <p className={styles.dropzoneInfo}>
                    <InfoSVG />
                    Additionally, you can add an external file in PDF or add multiple files in a single .zip file.
                </p>
            </div>
        );
    }
}

FileUploadDropzone.propTypes = {
    uploadError: PropTypes.string,
    uploadingToIPFS: PropTypes.bool,
    fileInput: PropTypes.object,
    onDrop: PropTypes.func.isRequired,
};

// Default props (if needed)
FileUploadDropzone.defaultProps = {
    uploadError: '',
    uploadingToIPFS: false,
    fileInput: null,
};

export default FileUploadDropzone;
