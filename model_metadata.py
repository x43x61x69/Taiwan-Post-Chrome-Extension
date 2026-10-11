"""Repair the beta model's declared output rank without changing nodes or weights.

The small descriptor uses ONNX's published field numbers and retains every other
field as protobuf unknown data. No additional ONNX package is needed.
Schema: https://github.com/onnx/onnx/blob/main/onnx/onnx.proto
"""
from google.protobuf import descriptor_pb2, descriptor_pool, message_factory


def model_class():
    schema = descriptor_pb2.FileDescriptorProto(name='post_ocr_shape.proto', package='post_shape', syntax='proto2')
    definitions = {
        'Dimension': [('dim_value', 1, 3, None, False), ('dim_param', 2, 9, None, False)],
        'Shape': [('dim', 1, 11, 'Dimension', True)],
        'TensorType': [('elem_type', 1, 5, None, False), ('shape', 2, 11, 'Shape', False)],
        'Type': [('tensor_type', 1, 11, 'TensorType', False)],
        'ValueInfo': [('name', 1, 9, None, False), ('type', 2, 11, 'Type', False)],
        'Graph': [('output', 12, 11, 'ValueInfo', True)],
        'Model': [('graph', 7, 11, 'Graph', False)],
    }
    for name, fields in definitions.items():
        message = schema.message_type.add(name=name)
        for name, number, kind, subtype, repeated in fields:
            field = message.field.add(name=name, number=number, type=kind, label=3 if repeated else 1)
            if subtype:
                field.type_name = f'.post_shape.{subtype}'
    pool = descriptor_pool.DescriptorPool()
    pool.Add(schema)
    return message_factory.GetMessageClass(pool.FindMessageTypeByName('post_shape.Model'))


def repair_output_shape(source, classes):
    model = model_class()()
    model.ParseFromString(source)
    if len(model.graph.output) != 1 or model.graph.output[0].name != '387':
        raise ValueError('非預期 beta 模型輸出，拒絕修改。')
    tensor_type = model.graph.output[0].type.tensor_type
    if tensor_type.elem_type != 1:
        raise ValueError('模型輸出應為 float32。')
    original = model.SerializeToString()
    shape = tensor_type.shape
    old_shape = type(shape)()
    old_shape.CopyFrom(shape)
    shape.ClearField('dim')
    shape.dim.add(dim_param='sequence_length')
    shape.dim.add(dim_value=1)
    shape.dim.add(dim_value=classes)
    repaired = model.SerializeToString()
    shape.CopyFrom(old_shape)
    if model.SerializeToString() != original:
        raise ValueError('輸出形狀之外的模型資料發生變更。')
    return repaired
